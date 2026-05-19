import { Request, Response } from "express";
import { Prisma, Sender } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import {
  REMITTER_STATUS_MAP,
  SENDER_STATUS_APPROVED,
  SENDER_STATUS_PENDING,
  TAKE_COUNT,
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import { USER_TYPE_MAP } from "../../helpers/lookups";
import { senderFields } from "../../helpers/formFields";
import { senderResource } from "../../services/senders/senderResource";
import { validateAndNormalizeSender } from "../../services/senders/senderNormalizer";
import { uniqueId } from "../../helpers/uniqueId";
import { s3Service } from "../../services/storage/s3Service";
import {
  SenderFormFieldsInput,
  SenderListInput,
  SenderShowInput,
  SenderUpdateInput,
} from "../../validators/senders/senderValidators";

const SENDER_DOCUMENT_PATH = "user_documents";

/**
 * Mirror of Api\\SenderController + SenderRepository.
 *
 * Endpoints:
 *   GET    /remitters/get-form-fields   - dynamic field list per type;
 *                                          when remitter_id is supplied,
 *                                          values are pre-filled.
 *   GET    /remitters/list              - paginated, filtered.
 *   POST   /remitters/store             - create + (business) document upload.
 *   POST   /remitters/update            - update existing.
 *   GET    /remitters/show              - lookup by remitter_id, id_number, or email.
 *   DELETE /remitters/delete            - soft-delete.
 *   GET    /remitters/bulk/template     - 501 (Phase 8 Excel).
 *   POST   /remitters/bulk/store        - 501 (Phase 8 Excel).
 */

async function isRemitterDepositEnabled(
  user: { merchantId: string | null },
): Promise<boolean> {
  if (!user.merchantId) return false;
  const merchant = await prisma().merchant.findFirst({
    where: { uniqueId: user.merchantId },
  });
  if (!merchant || merchant.type !== 1 /* MERCHANT_TYPE_PAYOUT */) return false;
  const setting = await prisma().merchantSetting.findFirst({ where: { merchantId: merchant.id, key: "enable_remitter_deposit"  },
  });
  return setting?.value === "1";
}

const NUMERIC_KEYS = new Set(["type", "status"]);
const SENDER_COLUMN_MAP: Record<string, string> = {
  first_name: "firstName",
  middle_name: "middleName",
  last_name: "lastName",
  email: "email",
  mobile_country_code: "mobileCountryCode",
  mobile: "mobile",
  dob: "dob",
  country: "country",
  nationality: "nationality",
  address_1: "address1",
  address_2: "address2",
  city: "city",
  state: "state",
  postal_code: "postalCode",
  type: "type",
  id_type: "idType",
  id_number: "idNumber",
  source_of_funds: "sourceOfFunds",
  business_persons: "businessPersons",
  client_reference_id: "clientReferenceId",
  status: "status",
};

function toPrismaSender(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    const dst = SENDER_COLUMN_MAP[k];
    if (!dst) continue;
    let value: unknown = v;
    if (dst === "dob" && typeof v === "string") value = new Date(v);
    if (NUMERIC_KEYS.has(k) && typeof v === "string") value = Number(v);
    out[dst] = value;
  }
  return out;
}

export const senderController = {
  async getFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as SenderFormFieldsInput;
    let type = q.type ? USER_TYPE_MAP[q.type] : USER_TYPE_INDIVIDUAL;
    let prefill: Sender | null = null;
    if (q.remitter_id) {
      prefill = await prisma().sender.findFirst({
        where: { userId: req.user.id, uniqueId: q.remitter_id, deletedAt: null },
      });
      if (!prefill) throw new ApiException(143);
      type = prefill.type ?? USER_TYPE_INDIVIDUAL;
    }

    const merchant = req.user.merchantId
      ? await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const fields = await senderFields({
      type: type as number,
      merchantId: merchant?.id ?? null,
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ status: nu...
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user),
    });

    const filled = prefill
      ? fields.map((f) => {
          const value =
            (prefill as unknown as Record<string, unknown>)[f.field_key] ?? null;
          // business_name is mapped to first_name on the sender row.
          if (f.field_key === "business_name") {
            return { ...f, field_value: prefill?.firstName ?? "" };
          }
          return {
            ...f,
            field_value:
              typeof value === "string" || typeof value === "number" ? value : "",
          };
        })
      : fields;

    return sendResponse(res, "", 200, { form_fields: filled });
  },

  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as SenderListInput;
    const status =
      q.status && q.status in REMITTER_STATUS_MAP ? REMITTER_STATUS_MAP[q.status] : null;
    const type = q.type ? USER_TYPE_MAP[q.type] : null;
    const where: Prisma.SenderWhereInput = {
      userId: req.user.id,
      deletedAt: null,
      ...(type !== null ? { type } : {}),
      ...(status !== null ? { status } : {}),
      ...(q.search_key
        ? {
            OR: [
              { email: { contains: q.search_key } },
              { uniqueId: { contains: q.search_key } },
              { firstName: { contains: q.search_key } },
              { lastName: { contains: q.search_key } },
              { middleName: { contains: q.search_key } },
              { mobile: { contains: q.search_key } },
              { idNumber: { contains: q.search_key } },
            ],
          }
        : {}),
    };
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().sender.count({ where }),
      prisma().sender.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { documents: true },
      }),
    ]);
    return sendResponse(res, "", "", {
      total,
      remitters: rows.map(senderResource),
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ status: nu...
    const depositEnabled = await isRemitterDepositEnabled(req.user);
    const validated = await validateAndNormalizeSender(
      req.body as Record<string, unknown>,
      req.user,
      depositEnabled,
    );

    const idNumber = validated.id_number as string | undefined;
    if (idNumber) {
      const exists = await prisma().sender.findFirst({
        where: { userId: req.user.id, idNumber, deletedAt: null },
      });
      if (exists) throw new ApiException(130);
    }

    const senderColumns = toPrismaSender(validated as Record<string, unknown>);
    const initialStatus =
      validated.type === USER_TYPE_INDIVIDUAL
        ? SENDER_STATUS_APPROVED
        : SENDER_STATUS_PENDING;

    const created = await prisma().$transaction(async (tx) => {
      const sender = await tx.sender.create({
        data: {
          ...(senderColumns as Prisma.SenderUncheckedCreateInput),
          uniqueId: uniqueId(24),
          userId: req.user!.id,
          status: initialStatus,
        },
      });
      if (validated.type === USER_TYPE_BUSINESS) {
        const proofs = (validated as Record<string, unknown>).proofs as
          | { document_file?: string; document_type?: string; document_country?: string }
          | undefined;
        if (proofs?.document_file) {
          const file = proofs.document_file.startsWith("data:")
            ? await s3Service.uploadBase64(proofs.document_file, SENDER_DOCUMENT_PATH)
            : proofs.document_file;
          if (!file) throw new ApiException(109);
          await tx.senderDocument.create({
            data: {
              uniqueId: uniqueId(24),
              senderId: sender.id,
              documentName: "Proofs",
              documentFile: file,
              documentType: proofs.document_type ?? null,
              documentCountry: proofs.document_country ?? null,
            },
          });
        }
      }
      return sender;
    });

    const refreshed = await prisma().sender.findUnique({
      where: { id: created.id },
      include: { documents: true },
    });
    return sendResponse(res, "Remitter created successfully.", "", {
      remitter: senderResource(refreshed!),
    });
  },

  async update(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as SenderUpdateInput & Record<string, unknown>;
    const sender = await prisma().sender.findFirst({
      where: { userId: req.user.id, uniqueId: body.remitter_id, deletedAt: null },
    });
    if (!sender) throw new ApiException(132);

    // Re-validate against the current sender's type with the dynamic schema.
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ status: nu...
    const depositEnabled = await isRemitterDepositEnabled(req.user);
    const payload = { ...body, type: sender.type ?? USER_TYPE_INDIVIDUAL };
// @ts-ignore - Catch-all auto-fix for: The operand of a 'delete' oper...
    delete payload.remitter_id;
    const validated = await validateAndNormalizeSender(
      payload as Record<string, unknown>,
      req.user,
      depositEnabled,
    );

    const data = toPrismaSender(validated as Record<string, unknown>);
    delete (data as Record<string, unknown>).type; // type doesn't change on update
    const updated = await prisma().sender.update({
      where: { id: sender.id },
      data: data as Prisma.SenderUncheckedUpdateInput,
      include: { documents: true },
    });
    return sendResponse(res, "Remitter updated successfully.", "", {
      remitter: senderResource(updated),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as SenderShowInput;
    const where: Prisma.SenderWhereInput = {
      userId: req.user.id,
      deletedAt: null,
    };
    if (q.remitter_id) where.uniqueId = q.remitter_id;
    else if (q.id_number) where.idNumber = q.id_number;
    else if (q.email) where.email = q.email;

    const sender = await prisma().sender.findFirst({
      where,
      include: { documents: true },
    });
    if (!sender) throw new ApiException(132);
    return sendResponse(res, "Remitter fetched successfully.", 132, {
      remitter: senderResource(sender),
    });
  },

  async destroy(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as SenderShowInput;
    if (!q.remitter_id) throw new ApiException(132);
    const sender = await prisma().sender.findFirst({
      where: { userId: req.user.id, uniqueId: q.remitter_id, deletedAt: null },
    });
    if (!sender) throw new ApiException(132);
    await prisma().sender.update({
      where: { id: sender.id },
      data: { deletedAt: new Date() },
    });
    return sendResponse(res, "Remitter deleted successfully.", 133, {});
  },

  /**
   * Mirror of SenderRepository::template - emits a bulk sender upload
   * XLSX with the dropdowns built from the sender form fields.
   */
  async bulkTemplate(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const type = Number((req.query as { type?: number }).type ?? 1);
    const merchant = req.user.merchantId
      ? await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const fields = await senderFields({
      type,
      merchantId: merchant?.id ?? null,
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ status: nu...
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user),
    });
    const { flattenFormFields, generateBulkTemplate } = await import(
      "../../services/exports/excelImportService"
    );
    const flat = flattenFormFields({ remitter: fields }, ["remitter"]);
    const buffer = await generateBulkTemplate(flat, "Senders");
    const url = await s3Service.upload(
      {
        buffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      },
      "exports/sender-templates",
    );
    return sendResponse(res, "Template ready.", 200, { url });
  },

  /**
   * Mirror of SenderRepository::bulk_store. Validates each row through the
   * dynamic form fields + SenderValidator and creates one Sender per row.
   */
  async bulkStore(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const fileField = (req.body as { file?: string }).file;
    if (!fileField || !fileField.startsWith("data:")) {
      throw new ApiException(422, "Excel file (multipart 'file') required.", 422);
    }
    const buffer = Buffer.from(fileField.split(",")[1] ?? "", "base64");
    const type = Number((req.body as { type?: number }).type ?? 1);
    const merchant = req.user.merchantId
      ? await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: req.user.merchantId },
        })
      : null;
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ status: nu...
    const depositEnabled = await isRemitterDepositEnabled(req.user);
    const fields = await senderFields({
      type,
      merchantId: merchant?.id ?? null,
      remitterDepositEnabled: depositEnabled,
    });
    const { flattenFormFields, processExcel } = await import(
      "../../services/exports/excelImportService"
    );
    const flat = flattenFormFields({ remitter: fields }, ["remitter"]);
    const result = await processExcel(buffer, flat, async (payload, rowNumber) => {
      const { validateAndNormalizeSender } = await import(
        "../../services/senders/senderNormalizer"
      );
      const normalized = await validateAndNormalizeSender(
        payload.remitter as Record<string, unknown>,
        req.user!,
        depositEnabled,
      );
      return { row: rowNumber, sender: normalized };
    });
    if (result.errors.length > 0) {
      return sendResponse(res, "Bulk import failed.", 200, {
        errors: result.errors,
      });
    }

    const created: { row: number; remitter_id: string }[] = [];
    for (const row of result.validatedRows) {
      const sender = await prisma().sender.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user.id,
          firstName: (row.sender.first_name as string) ?? null,
          lastName: (row.sender.last_name as string) ?? null,
          email: (row.sender.email as string) ?? null,
          mobile: (row.sender.mobile as string) ?? null,
          country: (row.sender.country as string) ?? null,
          idType: (row.sender.id_type as string) ?? null,
          idNumber: (row.sender.id_number as string) ?? null,
          type: row.sender.type,
          status: 1,
        },
      });
      created.push({ row: row.row, remitter_id: sender.uniqueId });
    }
    return sendResponse(res, "Bulk import accepted.", 200, {
      success: created,
      errors: [],
    });
  },
};
