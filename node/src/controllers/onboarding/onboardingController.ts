import { Request, Response } from "express";
import { Prisma, User, UserDocument } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  IDENTITY_VERIFICATION_PENDING,
  ID_VERIFIED_BY_ADMIN,
  ONBOARDING_STEP_ONE,
  ONBOARDING_STEP_TWO,
  ONBOARDING_STEP_THREE,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import {
  onboardingFormFields,
  onboardingFormFieldsNew,
  FieldDef,
} from "../../helpers/formFields";
import {
  ensureNoFieldErrors,
  validateAgainstFields,
} from "../../helpers/formFieldsValidator";
import { uniqueId } from "../../helpers/uniqueId";
import { settingGet } from "../../services/settings/settingsService";
import { s3Service } from "../../services/storage/s3Service";
import { logger } from "../../helpers/logger";
import { GetFormFieldsInput } from "../../validators/onboarding/onboardingValidators";
import { shapeDocumentsUser, shapeOnboardingUser } from "../../helpers/userShaper";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\\OnboardingController.
 *
 *   GET /onboarding/get-form-fields
 *     Returns the dynamic field list for (user_type, step). If the user has
 *     already advanced past the requested step, every field has its value
 *     pre-filled from User / UserInformation.
 *
 *   POST /onboarding/stepTwo
 *     Validates the dynamic form, writes user + user_information, advances
 *     onboarding_step to 2.
 *
 *   POST /onboarding/stepThree
 *     Persists KYC documents (S3-backed), advances onboarding_step to 3,
 *     optionally hands off to the configured KYC provider (full handoff
 *     lives in Phase 8; here we record id_verified_by + return a stub url).
 */

interface PersistableValidated extends Record<string, unknown> {
  business_persons?: unknown;
  owners?: unknown;
}

const USER_FIELDS = new Set([
  "first_name",
  "middle_name",
  "last_name",
  "title",
  "email",
  "mobile_country_code",
  "mobile",
  "dob",
  "gender",
  "user_type",
]);

function splitForUserVsInformation(
  validated: PersistableValidated,
): { user: Record<string, unknown>; info: Record<string, unknown> } {
  const userPart: Record<string, unknown> = {};
  const infoPart: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(validated)) {
    if (USER_FIELDS.has(k)) userPart[k] = v;
    else infoPart[k] = v;
  }
  // owners -> business_persons
  if (validated.owners !== undefined) {
    infoPart.business_persons = validated.owners;
    delete infoPart.owners;
  }
  return { user: userPart, info: infoPart };
}

/**
 * Snake-case keys -> camelCase Prisma columns. We allowlist the fields we
 * actually write so unexpected keys never sneak in via mass assignment.
 */
function userInformationCreateData(infoPart: Record<string, unknown>): Prisma.UserInformationUncheckedCreateInput {
  const out: Prisma.UserInformationUncheckedCreateInput = {
    uniqueId: uniqueId(24),
    userId: 0n, // populated by caller
  };
  const map: Array<[string, keyof Prisma.UserInformationUncheckedCreateInput]> = [
    ["country", "country"],
    ["address_1", "address1"],
    ["address_2", "address2"],
    ["city", "city"],
    ["state", "state"],
    ["postal_code", "postalCode"],
    ["legal_name", "legalName"],
    ["tax_id", "taxId"],
    ["business_name", "businessName"],
    ["website", "website"],
    ["formation_date", "formationDate"],
    ["business_persons", "businessPersons"],
    ["id_type", "idType"],
    ["id_number", "idNumber"],
    ["business_verification_type", "businessVerificationType"],
    ["purpose_of_transactions", "purposeOfTransactions"],
    ["profession", "profession"],
    ["source_of_income", "sourceOfIncome"],
    ["type_of_business", "type_of_business"],
    ["country_of_incorporation", "country_of_incorporation"],
  ];
  for (const [src, dst] of map) {
    if (infoPart[src] !== undefined) {
      let v = infoPart[src];
      if (dst === "formationDate" && typeof v === "string") {
        v = new Date(v);
      }
      // @ts-ignore - dynamic key assignment intentionally permissive
      out[dst] = v as never;
    }
  }
  return out;
}

function userUpdateData(userPart: Record<string, unknown>): Prisma.UserUncheckedUpdateInput {
  const out: Prisma.UserUncheckedUpdateInput = {};
  const allow = new Set([
    "first_name",
    "middle_name",
    "last_name",
    "title",
    "mobile_country_code",
    "mobile",
    "dob",
    "gender",
    "user_type",
  ]);
  const camel: Record<string, string> = {
    first_name: "firstName",
    middle_name: "middleName",
    last_name: "lastName",
    title: "title",
    mobile_country_code: "mobileCountryCode",
    mobile: "mobile",
    dob: "dob",
    gender: "gender",
    user_type: "userType",
  };
  for (const [k, v] of Object.entries(userPart)) {
    if (!allow.has(k)) continue;
    const dst = camel[k];
    if (!dst) continue;
    let value: unknown = v;
    if (dst === "dob" && typeof v === "string") value = new Date(v);
    // @ts-expect-error - dynamic key assignment intentionally permissive
    out[dst] = value as never;
  }
  return out;
}

async function prefillFromUser(
  fields: FieldDef[],
  user: User,
): Promise<FieldDef[]> {
  // Mirror of Laravel's "if onboarding_step > requested step, pre-fill values"
  // behavior. We pull UserInformation eagerly so per-field reads are cheap.
  const info = await prisma().userInformation.findFirst({ where: { userId: user.id },
  });
  return fields.map((f) => {
    const value =
      (user as unknown as Record<string, unknown>)[f.field_key] ??
      (info as unknown as Record<string, unknown> | null)?.[f.field_key] ??
      "";
    return { ...f, field_value: typeof value === "string" || typeof value === "number" ? value : "" };
  });
}

export const onboardingController = {
  async getFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const validated = req.query as unknown as GetFormFieldsInput;
    const step = validated.type;

    let fields = await onboardingFormFields(req.user.userType, step);
    const newFields = await onboardingFormFieldsNew(req.user.userType, validated);
    const existingKeys = new Set(fields.map((f) => f.field_key));
    fields = [
      ...fields,
      ...newFields.filter((f) => !existingKeys.has(f.field_key)),
    ];

    if (req.user.onboardingStep > step && req.user.onboardingStep !== ONBOARDING_STEP_ONE) {
      fields = await prefillFromUser(fields, req.user);
    }

    return sendResponse(res, "", 200, { form_fields: fields });
  },

  async stepTwo(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    if (Number(req.user.onboardingStep) !== ONBOARDING_STEP_ONE) throw new ApiException(108);

    const fields = await onboardingFormFields(req.user.userType, ONBOARDING_STEP_TWO);
    const result = validateAgainstFields(fields, req.body as Record<string, unknown>);
    const validated = ensureNoFieldErrors(result);
    const { user: userPart, info: infoPart } = splitForUserVsInformation(validated);

    const updated = await prisma().$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: req.user!.id },
        data: {
          ...userUpdateData(userPart),
          onboardingStep: ONBOARDING_STEP_TWO,
        },
      });

      const createData = userInformationCreateData(infoPart);
      createData.userId = u.id;
      // Update payload: same fields, but unique_id stays stable.
      const { uniqueId: _ignored, ...updateData } = createData;
      void _ignored;

      const existingInfo = await tx.userInformation.findFirst({
        where: { userId: u.id },
      });

      if (existingInfo) {
        await tx.userInformation.update({
          where: { id: existingInfo.id },
          data: updateData,
        });
      } else {
        await tx.userInformation.create({
          data: createData,
        });
      }
      return u;
    });

    const info = await prisma().userInformation.findFirst({
      where: { userId: updated.id },
    });
    return sendResponse(res, apiSuccess(106), 106, {
      user: await shapeOnboardingUser(updated, info),
    });
  },

  async stepThree(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    if (Number(req.user.onboardingStep) !== ONBOARDING_STEP_TWO) throw new ApiException(108);

    const fields = await onboardingFormFields(req.user.userType, ONBOARDING_STEP_THREE);
    const result = validateAgainstFields(fields, req.body as Record<string, unknown>);
    const validated = ensureNoFieldErrors(result);

    type DocumentEntry = {
      document_file?: string;
      document_back_file?: string;
      document_type?: string;
      document_country?: string;
      document_expiry_date?: string;
    };

    let resultUser: User | null = null;
    const documents: UserDocument[] = [];
    const uploads: Array<{ documentName: string; data: any }> = [];
    for (const [documentName, raw] of Object.entries(validated)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const doc = raw as DocumentEntry;

      const data: any = {
        status: IDENTITY_VERIFICATION_PENDING,
      };

      if (doc.document_file) {
        data.documentFile = doc.document_file.startsWith("data:")
          ? await s3Service.uploadBase64(
              doc.document_file,
              USER_DOCUMENT_FILE_PATH,
            )
          : doc.document_file;
        if (!data.documentFile) throw new ApiException(109);
      }
      if (doc.document_back_file) {
        data.documentBackFile = doc.document_back_file.startsWith("data:")
          ? await s3Service.uploadBase64(
              doc.document_back_file,
              USER_DOCUMENT_FILE_PATH,
            )
          : doc.document_back_file;
        if (!data.documentBackFile) throw new ApiException(109);
      }
      if (doc.document_type) data.documentType = doc.document_type;
      if (doc.document_country) data.documentCountry = doc.document_country;
      if (doc.document_expiry_date) {
        const d = new Date(doc.document_expiry_date);
        if (!Number.isNaN(d.getTime())) data.documentExpiryDate = d;
      }
      uploads.push({ documentName, data });
    }

    await prisma().$transaction(async (tx) => {
      for (const upload of uploads) {
        const existing = await tx.userDocument.findFirst({
          where: { userId: req.user!.id, documentName: upload.documentName },
        });
        const row = existing
          ? await tx.userDocument.update({
              where: { id: existing.id },
              data: upload.data,
            })
          : await tx.userDocument.create({
              data: {
                ...upload.data,
                uniqueId: uniqueId(24),
                userId: req.user!.id,
                documentName: upload.documentName,
              },
            });
        documents.push(row);
      }

      resultUser = await tx.user.update({
        where: { id: req.user!.id },
        data: {
          onboardingStep: ONBOARDING_STEP_THREE,
          memo: req.user!.memo ?? generateUserMemo(req.user!),
        },
      });
    });

    const data: Record<string, unknown> = {
      user: await shapeDocumentsUser(resultUser as unknown as User, documents),
    };

    // KYC handoff for individuals - mirror of Laravel's
    // Api\\OnboardingController::stepThree branch.
    if (resultUser && Number((resultUser as User).userType) === USER_TYPE_INDIVIDUAL) {
      const kycService = await settingGet<string>("kyc_service", "");
      if (kycService && kycService !== ID_VERIFIED_BY_ADMIN) {
        try {
          const { KycFactory } = await import(
            "../../services/external/kycFactory"
          );
          const driver = KycFactory.resolve(kycService);
          const url = await driver.make(resultUser as User);
          data.id_verification_url = url || null;
        } catch (err) {
          logger.error(
            { err, userId: (resultUser as User).id.toString(), provider: kycService },
            "KYC handoff failed - returning empty URL",
          );
          data.id_verification_url = null;
        }
      }
    }

    return sendResponse(res, apiSuccess(106), 106, data);
  },
};

function generateUserMemo(user: User): string {
  const name =
    user.userType === USER_TYPE_INDIVIDUAL
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : "";
  const prefix = (name || user.email).slice(0, 3).toUpperCase();
  const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `${prefix}${suffix}`;
}
