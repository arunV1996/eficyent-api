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
  const setting = await prisma().merchantSetting.findUnique({
    where: { merchantId_key: { merchantId: merchant.id, key: "enable_remitter_deposit" } },
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
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const fields = await senderFields({
      type: type as number,
      merchantId: merchant?.id ?? null,
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
      }),
    ]);
    return sendResponse(res, "", 200, {
      total,
      remitters: rows.map(senderResource),
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
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
    return sendResponse(res, "Sender created successfully.", 200, {
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
    const depositEnabled = await isRemitterDepositEnabled(req.user);
    const payload = { ...body, type: sender.type ?? USER_TYPE_INDIVIDUAL };
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
    return sendResponse(res, "Sender updated successfully.", 200, {
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
    return sendResponse(res, "Sender fetched successfully.", 132, {
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
    return sendResponse(res, "Sender deleted successfully.", 133);
  },

  bulkTemplate(_req: Request, _res: Response): never {
    throw new ApiException(
      501,
      "Sender bulk template is not yet available in the Node port (Phase 8).",
      501,
    );
  },
  bulkStore(_req: Request, _res: Response): never {
    throw new ApiException(
      501,
      "Sender bulk import is not yet available in the Node port (Phase 8).",
      501,
    );
  },
};
