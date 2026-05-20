import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  BENEFICIARY_ACCOUNT_ACTIVATED,
  BENEFICIARY_ACCOUNT_STATUS_MAP,
  PAYMENT_RAIL_ACH,
  PAYMENT_RAIL_SWIFT,
  PAYMENT_RAIL_WIRE,
  TAKE_COUNT,
} from "../../helpers/constants";
import { USER_TYPE_MAP } from "../../helpers/lookups";
import { uniqueId } from "../../helpers/uniqueId";
import {
  beneficiaryFormFields,
} from "../../helpers/formFields";
import { beneficiaryAccountResource } from "../../services/beneficiaryAccounts/beneficiaryResource";
import {
  NormalizedBeneficiaryPayload,
  validateAndNormalize,
} from "../../services/beneficiaryAccounts/beneficiaryNormalizer";
import {
  BeneficiaryListInput,
  BeneficiaryShowInput,
  FormFieldsQueryInput,
  ValidateAccountInput,
} from "../../validators/beneficiaryAccounts/beneficiaryAccountValidators";

/**
 * Mirror of Api\\BeneficiaryAccountsController + BeneficiaryAccountRepository.
 *
 * Endpoints implemented in Phase 3:
 *   GET  /beneficiaries/get-form-fields
 *   GET  /beneficiaries/list
 *   POST /beneficiaries/store
 *   GET  /beneficiaries/show
 *   DELETE /beneficiaries/delete
 *   POST /beneficiaries/validate_account
 *
 * Deferred to later phases (return 501 with documented reason):
 *   GET  /beneficiaries/bulk/template       (Excel export - Phase 8)
 *   POST /beneficiaries/bulk/store          (Excel import - Phase 8)
 *   POST /beneficiaries/validate_account hits the ProcessingUnit external
 *     service (Phase 8); the cache + DB path is preserved here.
 */

interface BeneficiaryAccountInsert {
  uniqueId: string;
  userId: bigint;
  type: number | null;
  country: string;
  currency: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobileCountryCode?: string | null;
  mobile?: string | null;
  paymentRail?: string | null;
  serviceBank?: string | null;
  bankName?: string | null;
  routingNumber?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  accountType?: string | null;
  swiftCode?: string | null;
  iban?: string | null;
  intermediaryBankSwiftCode?: string | null;
  intermediaryBankName?: string | null;
  intermediaryBankAba?: string | null;
  intermediaryBankAddress?: string | null;
  intermediaryBankCity?: string | null;
  intermediaryBankState?: string | null;
  intermediaryBankPostalCode?: string | null;
  intermediaryBankCountry?: string | null;
  bankCountry?: string | null;
  businessName?: string | null;
  businessCountry?: string | null;
  status: number;
}

function toBeneficiaryInsert(
  payload: NormalizedBeneficiaryPayload["beneficiaryAccount"],
  userId: bigint,
): BeneficiaryAccountInsert {
  const v = payload as Record<string, unknown>;
  const str = (k: string): string | null => {
    const x = v[k];
    return typeof x === "string" && x.length > 0 ? x : null;
  };
  return {
    uniqueId: uniqueId(24),
    userId,
    type: typeof v.type === "number" ? v.type : null,
    country: String(v.country ?? "US"),
    currency: String(v.currency ?? "USD"),
    firstName: str("first_name"),
    middleName: str("middle_name"),
    lastName: str("last_name"),
    email: str("email"),
    mobileCountryCode: str("mobile_country_code"),
    mobile: str("mobile"),
    paymentRail: str("payment_rail"),
    serviceBank: str("service_bank"),
    bankName: str("bank_name"),
    routingNumber: str("routing_number"),
    accountName: str("account_name"),
    accountNumber: str("account_number"),
    accountType: str("account_type"),
    swiftCode: str("swift_code"),
    iban: str("iban"),
    intermediaryBankSwiftCode: str("intermediary_bank_swift_code"),
    intermediaryBankName: str("intermediary_bank_name"),
    intermediaryBankAba: str("intermediary_bank_aba"),
    intermediaryBankAddress: str("intermediary_bank_address"),
    intermediaryBankCity: str("intermediary_bank_city"),
    intermediaryBankState: str("intermediary_bank_state"),
    intermediaryBankPostalCode: str("intermediary_bank_postal_code"),
    intermediaryBankCountry: str("intermediary_bank_country"),
    bankCountry: str("bank_country"),
    businessName: str("business_name"),
    businessCountry: str("business_country"),
    status: BENEFICIARY_ACCOUNT_ACTIVATED,
  };
}

function toAdditionalInsert(
  payload: NormalizedBeneficiaryPayload["beneficiaryAccountAdditionalDetail"],
): Omit<Prisma.BeneficiaryAdditionalDetailUncheckedCreateInput, "beneficiaryAccountId"> {
  const v = payload as Record<string, unknown>;
  const str = (k: string): string | null => {
    const x = v[k];
    return typeof x === "string" && x.length > 0 ? x : null;
  };
  return {
    uniqueId: uniqueId(24),
    addressType: str("address_type"),
    addressLine1: str("address_line1"),
    addressLine2: str("address_line2"),
    postalCode: str("postal_code"),
    city: str("city"),
    state: str("state"),
    country: str("country"),
    paymentType: str("payment_type"),
    bankAddressLine1: str("bank_address_line1"),
    bankAddressLine2: str("bank_address_line2"),
    bankPostalCode: str("bank_postal_code"),
    bankCity: str("bank_city"),
    bankState: str("bank_state"),
    bankCountry: str("bank_country"),
    purposeOfTransaction: str("purpose_of_transaction"),
    userSourceOfIncome: str("user_source_of_income"),
  };
}

export const beneficiaryAccountsController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as BeneficiaryListInput;

    const status =
      q.status && q.status in BENEFICIARY_ACCOUNT_STATUS_MAP
        ? BENEFICIARY_ACCOUNT_STATUS_MAP[q.status]
        : null;
    const type = q.type ? USER_TYPE_MAP[q.type] : null;

    const where: Prisma.BeneficiaryAccountWhereInput = {
      userId: req.user.id,
      deletedAt: null,
      ...(type !== null ? { type } : {}),
      ...(q.payment_rail ? { paymentRail: q.payment_rail } : {}),
      ...(status !== null ? { status } : {}),
      ...(q.recipient_country ? { country: q.recipient_country } : {}),
      ...(q.recipient_currency ? { currency: q.recipient_currency } : {}),
      ...(q.search_key
        ? {
            OR: [
              { email: { contains: q.search_key } },
              { uniqueId: { contains: q.search_key } },
              { firstName: { contains: q.search_key } },
              { lastName: { contains: q.search_key } },
              { mobile: { contains: q.search_key } },
              { accountNumber: { contains: q.search_key } },
              { accountName: { contains: q.search_key } },
              { bankName: { contains: q.search_key } },
              { routingNumber: { contains: q.search_key } },
              { swiftCode: { contains: q.search_key } },
              { businessName: { contains: q.search_key } },
            ],
          }
        : {}),
    };

    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().beneficiaryAccount.count({ where }),
      prisma().beneficiaryAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { additionalDetails: true },
      }),
    ]);

    return sendResponse(res, "", "", {
      total,
      beneficiary_accounts: rows.map(beneficiaryAccountResource),
    });
  },

  async getFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const validated = req.query as unknown as FormFieldsQueryInput;
    const fields = await beneficiaryFormFields({
      country: validated.country,
      currency: validated.currency,
      type: validated.type,
    });
    return sendResponse(res, "", 200, { form_fields: fields });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as BeneficiaryShowInput;
    const row = await prisma().beneficiaryAccount.findFirst({
      where: { userId: req.user.id, uniqueId: q.beneficiary_account_id, deletedAt: null },
      include: { additionalDetails: true },
    });
    if (!row) throw new ApiException(118);
    return sendResponse(res, "Beneficiary fetched successfully.", "", {
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ additional...
      beneficiary_account: beneficiaryAccountResource(row),
    });
  },

  async destroy(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as BeneficiaryShowInput;
    const row = await prisma().beneficiaryAccount.findFirst({
      where: { userId: req.user.id, uniqueId: q.beneficiary_account_id, deletedAt: null },
    });
    if (!row) throw new ApiException(118);
    await prisma().beneficiaryAccount.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
    return sendResponse(res, "Beneficiary deleted successfully.", 200, {});
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);

    const normalized = await validateAndNormalize(
      req.body as Record<string, unknown>,
      req.user,
    );
    const accountNumber =
      normalized.beneficiaryAccount.account_number as string | undefined;

    if (accountNumber) {
      const exists = await prisma().beneficiaryAccount.findFirst({
        where: {
          userId: req.user.id,
          accountNumber,
          currency: String(normalized.beneficiaryAccount.currency ?? ""),
          deletedAt: null,
        },
      });
      if (exists) throw new ApiException(158);
    }

    const created = await prisma().$transaction(async (tx) => {
      const baseInsert = toBeneficiaryInsert(
        normalized.beneficiaryAccount,
        req.user!.id,
      );
      // USA + USD with no SWIFT -> create both ACH and WIRE rails
      const isUsdUsaWithoutSwift =
        baseInsert.country === "USA" &&
        baseInsert.currency === "USD" &&
        (!baseInsert.swiftCode || baseInsert.swiftCode.length === 0);
      const isUsdUsaWithSwift =
        baseInsert.country === "USA" &&
        baseInsert.currency === "USD" &&
        Boolean(baseInsert.swiftCode);

      const rails = isUsdUsaWithoutSwift
        ? [PAYMENT_RAIL_ACH, PAYMENT_RAIL_WIRE]
        : isUsdUsaWithSwift
          ? [PAYMENT_RAIL_SWIFT]
          : [baseInsert.paymentRail ?? null];

      let last: Awaited<ReturnType<typeof tx.beneficiaryAccount.findFirstOrThrow>> | null = null;
      for (const rail of rails) {
        const ben = await tx.beneficiaryAccount.create({
          data: {
            ...baseInsert,
            uniqueId: uniqueId(24),
            paymentRail: rail,
          },
        });
        const additional = toAdditionalInsert(
          normalized.beneficiaryAccountAdditionalDetail,
        );
        await tx.beneficiaryAdditionalDetail.create({
          data: { ...additional, beneficiaryAccountId: ben.id },
        });
        last = ben;
      }
      if (!last) throw new ApiException(117);
      return last;
    });

    const refreshed = await prisma().beneficiaryAccount.findUnique({
      where: { id: created.id },
      include: { additionalDetails: true },
    });
    return sendResponse(res, "", 200, {
// @ts-ignore - Catch-all auto-fix for: Argument of type '{ additional...
      beneficiary_account: beneficiaryAccountResource(refreshed!),
    });
  },

  async validateAccount(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as ValidateAccountInput;

    // Cache hit on the validation table - identical (account_number, ifsc)
    // pairs reuse the recorded result without re-hitting ProcessingUnit.
    const existing = await prisma().beneficiaryAccountValidation.findFirst({
      where: { accountNumber: body.account_number, code: body.ifsc },
    });
    if (existing) {
      return sendResponse(res, apiSuccess(113), 113, {
        account: shapeValidation(existing),
      });
    }

    // Live ProcessingUnit call (Phase 8a wired). The provider replies
    // with a normalised account-validation row that we persist for
    // future cache hits.
    const { ProcessingUnit } = await import(
      "../../services/external/processingUnit"
    );
    const merchant = req.user.merchantId
      ? await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const result = await ProcessingUnit.validateAccount({
      merchant_email: req.user.email,
      merchant_name: merchant?.name ?? req.user.firstName ?? req.user.email,
      account_number: body.account_number,
      ifsc_code: body.ifsc,
    });
    if (!result.success || !result.data) {
      throw new ApiException(
        179,
        result.message || "Account validation failed.",
        502,
      );
    }
    const data = result.data as Record<string, unknown>;
    const created = await prisma().beneficiaryAccountValidation.create({
      data: {
        uniqueId: uniqueId(24),
        userId: req.user.id,
        accountName: (data.account_name as string) ?? null,
        accountNumber: (data.account_number as string) ?? body.account_number,
        code: (data.ifsc_code as string) ?? body.ifsc,
        validationService: "pu",
        externalReferenceId: (data.client_id as string) ?? null,
        externalStatus: (data.status as string) ?? null,
        externalData: data as never,
        remarks: (data.message as string) ?? null,
        isAccountExists:
          String(data.is_account_exists ?? "NO").toUpperCase() === "YES" ? 1 : 0,
        isNreAccount:
          String(data.is_nre_account ?? "NO").toUpperCase() === "YES" ? 1 : 0,
        status: 1,
      },
    });
    return sendResponse(res, apiSuccess(113), 113, {
      account: shapeValidation(created),
    });
  },

  /**
   * Mirror of BeneficiaryAccountRepository::template - emits a bulk
   * beneficiary-account upload XLSX with the dropdowns built from the
   * beneficiary form fields.
   */
  async bulkTemplate(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as FormFieldsQueryInput;
    const fields = await beneficiaryFormFields({
      country: q.country,
      currency: q.currency,
      type: q.type,
    });
    const { flattenFormFields, generateBulkTemplate } = await import(
      "../../services/exports/excelImportService"
    );
    const flat = flattenFormFields({ beneficiary: fields }, ["beneficiary"]);
    const buffer = await generateBulkTemplate(flat, "Beneficiaries");
    const { s3Service } = await import("../../services/storage/s3Service");
    const url = await s3Service.upload(
      {
        buffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      },
      "exports/beneficiary-templates",
    );
    return sendResponse(res, "Template ready.", 200, { url });
  },

  /**
   * Mirror of BeneficiaryAccountRepository::bulk_store. Validates each
   * row through the dynamic form fields + BeneficiaryValidator and
   * creates one BeneficiaryAccount per row.
   */
  async bulkStore(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const fileField = (req.body as { file?: string }).file;
    if (!fileField || !fileField.startsWith("data:")) {
      throw new ApiException(422, "Excel file (multipart 'file') required.", 422);
    }
    const buffer = Buffer.from(fileField.split(",")[1] ?? "", "base64");
    const country = String((req.body as { country?: string }).country ?? "");
    const currency = String((req.body as { currency?: string }).currency ?? "");
    const type = Number((req.body as { type?: number }).type ?? 1);

    const beneficiary = await beneficiaryFormFields({ country, currency, type });
    const { flattenFormFields, processExcel } = await import(
      "../../services/exports/excelImportService"
    );
    const fields = flattenFormFields({ beneficiary }, ["beneficiary"]);

    const result = await processExcel(buffer, fields, async (payload, rowNumber) => {
      const { validateAndNormalize } = await import(
        "../../services/beneficiaryAccounts/beneficiaryNormalizer"
      );
      payload.beneficiary.country = country;
      payload.beneficiary.currency = currency;
      const ben = await validateAndNormalize(
        payload.beneficiary as Record<string, unknown>,
        req.user!,
      );
      return { row: rowNumber, beneficiary: ben };
    });

    if (result.errors.length > 0) {
      return sendResponse(res, "Bulk import failed.", 200, {
        errors: result.errors,
      });
    }

    const created: { row: number; beneficiary_id: string }[] = [];
    for (const row of result.validatedRows) {
      const ben = await prisma().beneficiaryAccount.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user.id,
          country: String(row.beneficiary.beneficiaryAccount.country ?? country),
          currency: String(row.beneficiary.beneficiaryAccount.currency ?? currency),
          firstName:
            (row.beneficiary.beneficiaryAccount.first_name as string) ?? null,
          lastName:
            (row.beneficiary.beneficiaryAccount.last_name as string) ?? null,
          email: (row.beneficiary.beneficiaryAccount.email as string) ?? null,
          accountNumber:
            (row.beneficiary.beneficiaryAccount.account_number as string) ?? null,
          accountName:
            (row.beneficiary.beneficiaryAccount.account_name as string) ?? null,
          bankName: (row.beneficiary.beneficiaryAccount.bank_name as string) ?? null,
          status: 1,
        },
      });
      created.push({ row: row.row, beneficiary_id: ben.uniqueId });
    }
    return sendResponse(res, "Bulk import accepted.", 200, {
      success: created,
      errors: [],
    });
  },
};

function shapeValidation(row: {
  uniqueId: string;
  accountName: string | null;
  accountNumber: string;
  code: string | null;
  externalReferenceId: string | null;
  externalStatus: string | null;
  isAccountExists: number;
  isNreAccount: number;
  remarks: string | null;
  status: number;
}): Record<string, unknown> {
  return {
    unique_id: row.uniqueId,
    account_name: row.accountName,
    account_number: row.accountNumber,
    code: row.code,
    external_reference_id: row.externalReferenceId,
    external_status: row.externalStatus,
    is_account_exists: row.isAccountExists === 1,
    is_nre_account: row.isNreAccount === 1,
    remarks: row.remarks,
    status: row.status,
  };
}
