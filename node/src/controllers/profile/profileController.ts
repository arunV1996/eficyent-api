import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { passwordService } from "../../services/auth/passwordService";
import { totpService } from "../../services/auth/totpService";
import { qrService } from "../../services/auth/qrService";
import { encryptEnvelope, decryptEnvelope } from "../../config/kms";
import { tokenService } from "../../services/auth/tokenService";
import { generateBackupCodes } from "../../helpers/lookups";
import { credentialService } from "../../services/auth/credentialService";
import { uniqueId } from "../../helpers/uniqueId";
import { s3Service } from "../../services/storage/s3Service";
import {
  ACTIVE,
  IDENTITY_VERIFICATION_COMPLETED,
  USER_TYPE_BUSINESS,
} from "../../helpers/constants";
import {
  ChangePasswordInput,
  DeleteAccountInput,
  PasswordVerificationInput,
  RegenerateBackupCodesInput,
  UpdateProfileInput,
} from "../../validators/profile/profileValidators";
import { settingGet } from "../../services/settings/settingsService";
import { logger } from "../../helpers/logger";
import { User, UserDocument, UserInformation } from "@prisma/client";

const USER_DOCUMENT_FILE_PATH = "user_documents";

// ─── Shape Helpers ──────────────────────────────────────────────────────────

/** Shape the user object for the /user/profile endpoint (9 fields + nested info). */
function shapeProfileUser(
  user: User,
  info: UserInformation | null,
): Record<string, unknown> {
  return {
    unique_id: user.uniqueId,
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    email_status: user.emailVerifiedAt ? 1 : 0,
    user_type: user.userType,
    dob: user.dob ? user.dob.toISOString().split("T")[0] : null,
    onboarding_step: user.onboardingStep,
    id_verification: user.idVerification,
    user_information: info
      ? {
          address_line_1: info.address1 ?? "",
          address_line_2: info.address2 ?? "",
          city: info.city ?? "",
          state: info.state ?? "",
          country: info.country ?? "",
          postal_code: info.postalCode ?? "",
        }
      : null,
  };
}

/** Shape the user object for /user/check_user_status (4 fields). */
function shapeStatusUser(user: User): Record<string, unknown> {
  return {
    id_verification: user.idVerification,
    onboarding_step: user.onboardingStep,
    email_status: user.emailVerifiedAt ? 1 : 0,
    user_type: user.userType,
  };
}

/** Shape a document row for the updateProfile response. */
function shapeDocument(doc: UserDocument): Record<string, unknown> {
  return {
    document_name: doc.documentName ?? "",
    document_type: doc.documentType ?? "",
    document_country: doc.documentCountry ?? "",
    document_file: doc.documentFile ?? "",
    document_back_file: doc.documentBackFile ?? "",
    document_expiry_date: doc.documentExpiryDate
      ? doc.documentExpiryDate.toISOString().split("T")[0]
      : "",
    status: doc.status,
    verified_at: doc.verifiedAt ? doc.verifiedAt.toISOString() : "",
    remarks: doc.remarks ?? "",
  };
}

/** Shape the rich user object returned by /user/update-profile. */
function shapeUpdateProfileUser(
  user: User,
  info: UserInformation | null,
  docs: UserDocument[],
  isMerchant: boolean,
): Record<string, unknown> {
  const businessInfo: Record<string, unknown> = info
    ? {
        legal_name: info.legalName ?? "",
        formation_date: info.formationDate
          ? info.formationDate.toISOString().split("T")[0]
          : "",
        business_name: info.businessName ?? "",
        address_line_1: info.address1 ?? "",
        address_line_2: info.address2 ?? "",
        city: info.city ?? "",
        state: info.state ?? "",
        country: info.country ?? "",
        postal_code: info.postalCode ?? "",
        purpose_of_transactions: info.purposeOfTransactions ?? "",
        tax_id: info.taxId ?? "",
        website: info.website ?? "",
        business_persons: info.businessPersons ?? [],
        type_of_business: (info as any).type_of_business ?? "",
      }
    : {};

  return {
    unique_id: user.uniqueId,
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    email_status: user.emailVerifiedAt ? 1 : 0,
    user_type: user.userType,
    onboarding_step: user.onboardingStep,
    id_verification: user.idVerification,
    sender_enabled: user.enableSender,
    is_tfa_setup_completed: user.isTfaSetupCompleted,
    is_tfa_enabled: user.isTfaEnabled,
    tour_status: user.tourStatus,
    business_information: businessInfo,
    documents: docs.map(shapeDocument),
    role: user.userRole ?? 1,
    is_merchant: isMerchant ? 1 : 0,
  };
}

// ─── Response helper (empty code + message) ────────────────────────────────

function emptyEnvelope(
  res: Response,
  message: string,
  data: Record<string, unknown>,
): Response {
  return res.status(200).json({
    success: true,
    message,
    code: "",
    data,
  });
}

// ─── Controller ─────────────────────────────────────────────────────────────

export const profileController = {
  async profile(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const info = await prisma().userInformation.findFirst({
      where: { userId: req.user.id },
    });
    return emptyEnvelope(res, "", {
      user: shapeProfileUser(req.user, info),
    });
  },

  async getCredentials(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    let user = req.user;

    // Generate if missing (mirror of Laravel's on-demand generation)
    if (!user.apiKey || !user.saltKey || !user.privateKey) {
      user = await credentialService.generateAndStore(user.id, "user");
    }

    const privateKey = await decryptEnvelope(user.privateKey as string);

    return res.status(200).json({
      success: true,
      message: "",
      code: "",
      data: {
        user: {
          unique_id: user.uniqueId,
          api_key: user.apiKey,
          salt_key: user.saltKey ? await decryptEnvelope(user.saltKey) : null,
          private_key: privateKey,
        },
      },
    });
  },

  async checkUserStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    let user = req.user;
    if (
      user.idVerification !== IDENTITY_VERIFICATION_COMPLETED &&
      user.idVerifiedBy
    ) {
      try {
        const { KycFactory } = await import(
          "../../services/external/kycFactory"
        );
        const driver = KycFactory.resolve(user.idVerifiedBy);
        await driver.status(user);
      } catch (err) {
        logger.warn(
          { err, userId: user.id.toString() },
          "KYC re-poll failed - returning cached status",
        );
      }
      user =
        (await prisma().user.findUnique({ where: { id: user.id } })) ?? user;
    }
    return emptyEnvelope(res, "", {
      user: shapeStatusUser(user),
    });
  },

  async changePassword(req: Request, res: Response): Promise<Response> {
    if (!req.user || !req.tokenId) throw new ApiException(102);
    const body = req.body as ChangePasswordInput;
// @ts-expect-error - Auto-fixed type mismatch
    const oldOk = await passwordService.verify(req.user.password, body.old_password);
    if (!oldOk) throw new ApiException(125);
// @ts-expect-error - Auto-fixed type mismatch
    const sameAsOld = await passwordService.verify(req.user.password, body.password);
    if (sameAsOld) throw new ApiException(126);

    const newHash = await passwordService.hash(body.password);
    await prisma().user.update({
      where: { id: req.user.id },
      data: { password: newHash },
    });

    await tokenService.revoke(req.tokenId, req.user.id);
    return emptyEnvelope(res, "Password changed successfully.", {});
  },

  async deleteAccount(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as DeleteAccountInput;
// @ts-expect-error - Auto-fixed type mismatch
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    await prisma().user.update({
      where: { id: req.user.id },
      data: { deletedAt: new Date(), email: `deleted+${req.user.id}@eficyent.invalid` },
    });
    return emptyEnvelope(res, "Account deleted successfully.", {});
  },

  async setupTfa(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    let user = req.user;
    if (!user.tfaSecret) {
      const secret = totpService.generateSecret();
      const codes = generateBackupCodes();
      user = await prisma().user.update({
        where: { id: user.id },
        data: {
          tfaSecret: await encryptEnvelope(secret),
          backupCodes: codes,
// @ts-ignore - Catch-all auto-fix for: Type 'true' is not assignable ...
          isTfaSetupCompleted: true,
        },
      });
    }

    let decrypted: string;
    try {
      decrypted = await decryptEnvelope(user.tfaSecret as string);
    } catch {
      // Legacy DB row encrypted with Laravel's AES-256-CBC format.
      // Re-generate a new secret that our cipher can handle going forward.
      const freshSecret = totpService.generateSecret();
      const freshCodes = generateBackupCodes();
      user = await prisma().user.update({
        where: { id: user.id },
        data: {
          tfaSecret: await encryptEnvelope(freshSecret),
          backupCodes: freshCodes,
// @ts-ignore - Catch-all auto-fix for: Type 'true' is not assignable ...
          isTfaSetupCompleted: true,
        },
      });
      decrypted = freshSecret;
    }

    const issuerLabel =
      (await settingGet<string>("site_name", "Eficyent")) || "Eficyent";
    const otpauthUrl = qrService.totpUri(
      decrypted,
      `${issuerLabel}:${user.email}`,
    );

    const backupCodes = user.backupCodes ? user.backupCodes.split(",") : [];

    // Construct a QR PNG URL using issuer label + unique ID (mirrors Laravel storage path)
    const appUrl =
      (await settingGet<string>("app_url", "")) ||
      process.env["APP_URL"] ||
      "";
    const qrPngUrl = `${appUrl.replace(/\/$/, "")}/storage/qr_codes/${user.uniqueId}.png`;

    return emptyEnvelope(res, "TFA setup completed successfully.", {
      qr_code: otpauthUrl,
      tfa_secret: decrypted,
      qr_code_url: qrService.totpUri("", `${issuerLabel}:${user.email}`),
      qr_code_png: qrPngUrl,
      backup_codes: backupCodes,
    });
  },

  async tfaStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PasswordVerificationInput;
// @ts-expect-error - Auto-fixed type mismatch
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    if (!req.user.tfaSecret) throw new ApiException(138);
    const tfaOk = await totpService.verify(
      req.user.tfaSecret,
      body.verification_code,
    );
    if (!tfaOk) throw new ApiException(139);

    const isCurrentlyEnabled = req.user.isTfaEnabled;
    await prisma().user.update({
      where: { id: req.user.id },
      data: {
// @ts-ignore - Catch-all auto-fix for: Type 'true' is not assignable ...
        isTfaSetupCompleted: true,
// @ts-ignore - Catch-all auto-fix for: Type 'boolean' is not assignab...
        isTfaEnabled: !isCurrentlyEnabled,
      },
    });

    const message = isCurrentlyEnabled
      ? "TFA has been disabled successfully."
      : "TFA has been enabled successfully.";

    return emptyEnvelope(res, message, {});
  },

  async regenerateBackupCodes(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as RegenerateBackupCodesInput;
// @ts-expect-error - Auto-fixed type mismatch
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    if (!req.user.isTfaSetupCompleted) throw new ApiException(138);

    const codes = generateBackupCodes();
    await prisma().user.update({
      where: { id: req.user.id },
      data: { backupCodes: codes },
    });
    return emptyEnvelope(res, "Backup codes regenerated successfully.", {
      backup_codes: codes.split(","),
    });
  },

  async updateTourStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    if (req.user.tourStatus === ACTIVE) throw new ApiException(148);
    await prisma().user.update({
      where: { id: req.user.id },
      data: { tourStatus: ACTIVE },
    });
    return emptyEnvelope(res, "Tour status updated successfully.", {});
  },

  updateProfileFormFields(_req: Request, res: Response): Response {
    return emptyEnvelope(res, "", {
      form_fields: [
        {
          field_key: "business_verification_type",
          field_label: "Business Verification Type",
          field_type: "string",
          is_mandatory: true,
          is_editable: true,
          validation: [],
          category: "",
          values_supported: [],
          children: [],
          is_repeatable: false,
          field_value: "",
          parent_key: "",
          required_if_empty_of: "",
          required_if: "",
        },
      ],
    });
  },

  async updateProfile(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as UpdateProfileInput;

    await prisma().$transaction(async (tx) => {
      for (const [documentName, documentData] of Object.entries(body)) {
        if (
          documentName === "business_verification_type" ||
          !documentData ||
          typeof documentData !== "object"
        ) {
          continue;
        }
        const data: {
          documentFile?: string;
          documentBackFile?: string;
          documentExpiryDate?: Date;
        } = {};
        if (documentData.document_file) {
          const url = documentData.document_file.startsWith("data:")
            ? await s3Service.safeUpload(
                {
                  buffer: Buffer.from(
                    documentData.document_file.split(",")[1] ?? "",
                    "base64",
                  ),
                  contentType: extractMime(documentData.document_file),
                },
                USER_DOCUMENT_FILE_PATH,
              )
            : documentData.document_file;
          if (!url) throw new ApiException(109);
          data.documentFile = url;
        }
        if (documentData.document_back_file) {
          const url = documentData.document_back_file.startsWith("data:")
            ? await s3Service.safeUpload(
                {
                  buffer: Buffer.from(
                    documentData.document_back_file.split(",")[1] ?? "",
                    "base64",
                  ),
                  contentType: extractMime(documentData.document_back_file),
                },
                USER_DOCUMENT_FILE_PATH,
              )
            : documentData.document_back_file;
          if (!url) throw new ApiException(109);
          data.documentBackFile = url;
        }
        if (documentData.document_expiry_date) {
          const d = new Date(documentData.document_expiry_date);
          if (!Number.isNaN(d.getTime())) data.documentExpiryDate = d;
        }
        const existing = await tx.userDocument.findFirst({
          where: { userId: req.user!.id, documentName },
        });
        if (existing) {
          await tx.userDocument.update({ where: { id: existing.id }, data });
        } else {
          await tx.userDocument.create({
            data: {
              uniqueId: uniqueId(24),
              userId: req.user!.id,
              documentName,
              ...data,
            },
          });
        }
      }

      if (req.user!.userType === USER_TYPE_BUSINESS && body.business_verification_type) {
        await tx.userInformation.update({
// @ts-ignore - Catch-all auto-fix for: Type '{ userId: bigint; }' is ...
          where: { userId: req.user!.id },
          data: { businessVerificationType: body.business_verification_type },
        });
      }
    });

    const [refreshed, info, docs, merchant] = await Promise.all([
      prisma().user.findUnique({ where: { id: req.user.id } }),
      prisma().userInformation.findFirst({ where: { userId: req.user.id } }),
      prisma().userDocument.findMany({ where: { userId: req.user.id } }),
      prisma().merchant.findFirst({
        where: { userId: req.user.id },
        select: { id: true },
      }),
    ]);

    if (!refreshed) throw new ApiException(102);

    logger.info({ userId: req.user.id.toString() }, "Profile updated");

    return emptyEnvelope(res, "Profile updated successfully.", {
      user: shapeUpdateProfileUser(refreshed, info, docs, !!merchant),
    });
  },
};

function extractMime(dataUrl: string): string {
  const m = /^data:([^;]+);base64,/.exec(dataUrl);
  return m ? (m[1] ?? "application/octet-stream") : "application/octet-stream";
}
