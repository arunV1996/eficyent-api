import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { passwordService } from "../../services/auth/passwordService";
import { totpService, checkBackupCode } from "../../services/auth/totpService";
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
  ID_VERIFIED_BY_ADMIN,
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
import { getBusinessModel } from "../../services/merchants/merchantService";
// Removed unused imports

const USER_DOCUMENT_FILE_PATH = "user_documents";

import {
  shapeFullUser,
  shapeStatusUser,
} from "../../helpers/userShaper";

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
    const userId = req.user.id;
    const [info, docs, merchant] = await Promise.all([
      prisma().userInformation.findFirst({ where: { userId } }),
      prisma().userDocument.findMany({ where: { userId } }),
      prisma().merchant.findFirst({
        where: { userId },
        select: { id: true },
      }),
    ]);
    const businessModel = await getBusinessModel(merchant?.id ?? req.user.merchantId);
    return emptyEnvelope(res, "", {
      user: await shapeFullUser(req.user, info, docs, !!merchant, businessModel),
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

    const dataPayload: Record<string, any> = {
      user: {
        unique_id: user.uniqueId,
        api_key: user.apiKey,
        salt_key: user.saltKey ? await decryptEnvelope(user.saltKey) : null,
        private_key: privateKey,
      },
    };

    if (user.merchantId) {
      let merchant = await prisma().merchant.findUnique({
        where: { id: user.merchantId },
      });

      if (merchant) {
        if (!merchant.apiKey || !merchant.saltKey || !merchant.privateKey) {
          merchant = await credentialService.generateAndStore(merchant.id, "merchant");
        }
        
        const merchantPrivateKey = await decryptEnvelope(merchant?.privateKey as string);
        
        dataPayload.merchant = {
          unique_id: merchant?.uniqueId || null,
          api_key: merchant?.apiKey || null,
          salt_key: merchant?.saltKey ? await decryptEnvelope(merchant?.saltKey) : null,
          private_key: merchantPrivateKey,
        };
      }
    }

    return res.status(200).json({
      success: true,
      message: "",
      code: "",
      data: dataPayload,
    });
  },

  async checkUserStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    let user = req.user;

    // 1. In-flight KYC re-poll logic (existing)
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

    // 2. Load context for shaper (Merchant status + UserInformation for names)
    const [info, merchant] = await Promise.all([
      prisma().userInformation.findFirst({ where: { userId: user.id } }),
      prisma().merchant.findFirst({
        where: { userId: user.id },
        select: { id: true },
      }),
    ]);

    const businessModel = await getBusinessModel(merchant?.id ?? user.merchantId);
    const data: Record<string, unknown> = {
      user: shapeStatusUser(user, !!merchant, info, businessModel),
    };

    // 3. Optional id_verification_url if individual (mirror of onboarding step 3)
    const { USER_TYPE_INDIVIDUAL } = await import("../../helpers/constants");
    if (Number(user.userType) === USER_TYPE_INDIVIDUAL) {
      const kycService = await settingGet<string>("kyc_service", "");
      if (kycService && kycService !== ID_VERIFIED_BY_ADMIN) {
        try {
          const { KycFactory } = await import(
            "../../services/external/kycFactory"
          );
          const driver = KycFactory.resolve(kycService);
          const url = await driver.make(user);
          data.id_verification_url = url || null;
        } catch (err) {
          logger.error(
            { err, userId: user.id.toString() },
            "KYC link generation failed in status check",
          );
        }
      }
    }

    return emptyEnvelope(res, "", data);
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
        },
      });
      decrypted = freshSecret;
    }

    const issuerLabel =
      (await settingGet<string>("site_name", "EFICyent")) || "EFICyent";
    const otpauthUrl = qrService.totpUri(
      decrypted,
      user.email,
      issuerLabel,
    );

    const qrDataUrl = await qrService.generateSvg(otpauthUrl);

    // Construct a QR PNG URL using issuer label + unique ID (mirrors Laravel storage path)
    

    return emptyEnvelope(res, "", {
      qr_code: qrDataUrl,
      tfa_secret: decrypted,
      qr_code_url: otpauthUrl,
      qr_code_png: qrDataUrl, // Fallback to data URI if frontend relies on image rendering
    });
  },

  async tfaStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PasswordVerificationInput;
// @ts-expect-error - Auto-fixed type mismatch
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    if (!req.user.tfaSecret) throw new ApiException(138);
    let tfaOk = await totpService.verify(
      req.user.tfaSecret,
      body.verification_code,
    );
    if (!tfaOk && req.user.backupCodes) {
      let plaintextCodes = req.user.backupCodes;
      if (!/^\d{6}(,\d{6})*$/.test(plaintextCodes)) {
        try {
          plaintextCodes = await decryptEnvelope(plaintextCodes);
        } catch (e) {
          // fallback
        }
      }
      const backupCheck = checkBackupCode(plaintextCodes, body.verification_code);
      if (backupCheck.ok) {
        tfaOk = true;
        const encryptedRemaining = backupCheck.remaining
          ? await encryptEnvelope(backupCheck.remaining)
          : null;
        await prisma().user.update({
          where: { id: req.user.id },
          data: { backupCodes: encryptedRemaining },
        });
      }
    }
    if (!tfaOk) throw new ApiException(139);

    const isCurrentlyEnabled = !!req.user.isTfaEnabled;
    const becomingEnabled = !isCurrentlyEnabled;

    const updated = await prisma().user.update({
      where: { id: req.user.id },
      data: {
        isTfaSetupCompleted: 1,
        isTfaEnabled: becomingEnabled ? 1 : 0,
      },
    });

    const message = becomingEnabled
      ? "TFA has been enabled successfully."
      : "TFA has been disabled successfully.";

    const data: Record<string, unknown> = {};
    if (becomingEnabled && updated.backupCodes) {
      let plaintextCodes = updated.backupCodes;
      if (!/^\d{6}(,\d{6})*$/.test(plaintextCodes)) {
        try {
          plaintextCodes = await decryptEnvelope(plaintextCodes);
        } catch (e) {
          // fallback
        }
      }
      data["backup_codes"] = plaintextCodes.split(",");
    }

    return emptyEnvelope(res, message, data);
  },

  async regenerateBackupCodes(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as RegenerateBackupCodesInput;
// @ts-expect-error - Auto-fixed type mismatch
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    if (!req.user.isTfaSetupCompleted) throw new ApiException(138);

    const codes = generateBackupCodes();
    const encryptedCodes = await encryptEnvelope(codes);
    await prisma().user.update({
      where: { id: req.user.id },
      data: { backupCodes: encryptedCodes },
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

  async updateProfileFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);

    const today = new Date().toISOString().split("T")[0];
    const isBusiness = Number(req.user.userType) === USER_TYPE_BUSINESS;

    const commonChildOptions = {
      is_repeatable: false,
      field_value: "",
      parent_key: "",
      required_if_empty_of: "",
      required_if: "",
      values_supported: [],
      children: [],
      category: "",
    };

    const backFileChild = {
      field_key: "document_back_file",
      field_label: "Document Back File",
      field_type: "file",
      is_mandatory: true,
      is_editable: true,
      validation: {
        accepted_extensions: [
          "image/jpeg",
          "image/png",
          "image/jpg",
          "application/pdf",
        ],
        max_file_size: 5242880,
      },
      ...commonChildOptions,
    };

    const expiryDateChild = {
      field_key: "document_expiry_date",
      field_label: "Document Expiry Date",
      field_type: "date",
      is_mandatory: true,
      is_editable: true,
      validation: {
        min_date: today,
      },
      ...commonChildOptions,
    };

    const fields: any[] = [
      {
        field_key: "proof_of_address",
        field_label: "Proof of Address",
        field_type: "group",
        is_mandatory: true,
        is_editable: true,
        is_repeatable: false,
        category: "Proof of Address",
        children: [backFileChild, expiryDateChild],
        validation: [],
        values_supported: [],
      },
      {
        field_key: isBusiness ? "proof_of_ownership" : "id_document",
        field_label: isBusiness ? "Proof of Ownership" : "ID Document",
        field_type: "group",
        is_mandatory: true,
        is_editable: true,
        is_repeatable: false,
        category: isBusiness ? "Proof of Ownership" : "ID Document",
        children: [backFileChild, expiryDateChild],
        validation: [],
        values_supported: [],
      },
      {
        field_key: "source_of_funds",
        field_label: "Source of Funds",
        field_type: "group",
        is_mandatory: true,
        is_editable: true,
        is_repeatable: false,
        category: "Source of Funds",
        children: [backFileChild, expiryDateChild],
        validation: [],
        values_supported: [],
      },
    ];

    if (isBusiness) {
      fields.push({
        field_key: "business_verification_type",
        field_label: "Business Verification Type",
        field_type: "string",
        is_mandatory: true,
        is_editable: true,
        validation: [],
        category: "",
        values_supported: [
          {
            label: "Proof of Business Registration and Legal Existence",
            value: "Proof_Of_Business_Registration",
          },
          {
            label: "Certificate of Incorporation",
            value: "Cretificate_Of_Incorporation",
          },
          {
            label: "Business Registration Certificate",
            value: "Business_Registration_Certificate",
          },
          {
            label: "Articles of Incorporation",
            value: "Articles_Of_Incorporationn",
          },
          {
            label: "Bylaws",
            value: "Bylaws",
          },
          {
            label: "Partnership Agreements",
            value: "Partnership_Agreements",
          },
          {
            label: "Operating Agreement",
            value: "Operating_Agreement",
          },
        ],
        children: [],
        is_repeatable: false,
        field_value: "",
        parent_key: "",
        required_if_empty_of: "",
        required_if: "",
      });
    }

    return emptyEnvelope(res, "", {
      form_fields: fields,
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

      if (
        Number(req.user!.userType) === USER_TYPE_BUSINESS &&
        body.business_verification_type
      ) {
        const existingInfo = await tx.userInformation.findFirst({
          where: { userId: req.user!.id },
        });
        if (existingInfo) {
          await tx.userInformation.update({
            where: { id: existingInfo.id },
            data: { businessVerificationType: body.business_verification_type },
          });
        } else {
          await tx.userInformation.create({
            data: {
              uniqueId: uniqueId(24),
              userId: req.user!.id,
              businessVerificationType: body.business_verification_type,
            },
          });
        }
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

    const businessModel = await getBusinessModel(merchant?.id ?? refreshed.merchantId);
    return emptyEnvelope(res, "Profile updated successfully.", {
      user: await shapeFullUser(refreshed, info, docs, !!merchant, businessModel),
    });
  },
};

function extractMime(dataUrl: string): string {
  const m = /^data:([^;]+);base64,/.exec(dataUrl);
  return m ? (m[1] ?? "application/octet-stream") : "application/octet-stream";
}
