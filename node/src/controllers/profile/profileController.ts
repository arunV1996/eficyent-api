import { Request, Response } from "express";
import { generateKeyPairSync } from "crypto";
import { prisma } from "../../db/prisma";
import { sendResponse } from "../../helpers/response";
import { ApiException } from "../../helpers/errors";
import { passwordService } from "../../services/auth/passwordService";
import { totpService } from "../../services/auth/totpService";
import { qrService } from "../../services/auth/qrService";
import { encryptEnvelope, decryptEnvelope } from "../../config/kms";
import { tokenService } from "../../services/auth/tokenService";
import { generateBackupCodes } from "../../helpers/lookups";
import { uniqueId } from "../../helpers/uniqueId";
import { s3Service } from "../../services/storage/s3Service";
import {
  ACTIVE,
  IDENTITY_VERIFICATION_COMPLETED,
  METHOD_GET_CREDENTIALS,
  METHOD_PROFILE,
  METHOD_USER_STATUS,
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import {
  ChangePasswordInput,
  DeleteAccountInput,
  PasswordVerificationInput,
  RegenerateBackupCodesInput,
  UpdateProfileInput,
} from "../../validators/profile/profileValidators";
import { userResource } from "../../services/auth/userResource";
import { settingGet } from "../../services/settings/settingsService";
import { logger } from "../../helpers/logger";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\\ProfileController. All response shapes preserved.
 *
 * Notes on KYC + S3:
 *   - Document uploads accept either pre-uploaded URLs (already on S3) or
 *     base64 data URIs that we forward to s3Service. Multipart uploads will
 *     be added via multer when the file-upload middleware ships in Phase 3.
 *   - check_user_status calls into KycFactory in Laravel; that integration
 *     lands in Phase 8. For Phase 2 the endpoint returns the current user
 *     state without re-polling the KYC provider.
 */

export const profileController = {
  async profile(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    return sendResponse(res, "", 200, {
      user: userResource(req.user, METHOD_PROFILE),
    });
  },

  async getCredentials(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const user = req.user;

    // Generate a fresh RSA keypair on each call - matches Laravel behaviour.
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const updated = await prisma().user.update({
      where: { id: user.id },
      data: {
        publicKey: await encryptEnvelope(publicKey),
        privateKey: await encryptEnvelope(privateKey),
      },
    });

    const data: Record<string, unknown> = {
      user: {
        ...userResource(updated, METHOD_GET_CREDENTIALS),
        // Surface unencrypted keys exactly once - this is the only endpoint
        // that ever does so. Clients must store them client-side and never
        // round-trip back to us.
        public_key: publicKey,
        private_key: privateKey,
      },
    };

    return sendResponse(res, "", 200, data);
  },

  async checkUserStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    let user = req.user;
    if (
      user.userType === USER_TYPE_INDIVIDUAL &&
      user.idVerification !== IDENTITY_VERIFICATION_COMPLETED &&
      user.idVerifiedBy
    ) {
      // KYC re-poll lives in Phase 8; for now we just re-read the user row
      // so any callback-driven updates are reflected.
      user =
        (await prisma().user.findUnique({ where: { id: user.id } })) ?? user;
    }
    return sendResponse(res, "", 200, { user: userResource(user, METHOD_USER_STATUS) });
  },

  async changePassword(req: Request, res: Response): Promise<Response> {
    if (!req.user || !req.tokenId) throw new ApiException(102);
    const body = req.body as ChangePasswordInput;
    const oldOk = await passwordService.verify(req.user.password, body.old_password);
    if (!oldOk) throw new ApiException(125);
    const sameAsOld = await passwordService.verify(req.user.password, body.password);
    if (sameAsOld) throw new ApiException(126);

    const newHash = await passwordService.hash(body.password);
    await prisma().$transaction([
      prisma().user.update({
        where: { id: req.user.id },
        data: { password: newHash },
      }),
    ]);

    // Revoke the current token so the user must log in again.
    await tokenService.revoke(req.tokenId, req.user.id);
    return sendResponse(res, "Password changed successfully.", 200, []);
  },

  async deleteAccount(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as DeleteAccountInput;
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    await prisma().user.update({
      where: { id: req.user.id },
      data: { deletedAt: new Date(), email: `deleted+${req.user.id}@eficyent.invalid` },
    });
    return sendResponse(res, "Account deleted successfully.", 200, []);
  },

  async setupTfa(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    let user = req.user;
    if (!user.tfaSecret) {
      const secret = totpService.generateSecret();
      user = await prisma().user.update({
        where: { id: user.id },
        data: {
          tfaSecret: await encryptEnvelope(secret),
          backupCodes: generateBackupCodes(),
        },
      });
    }

    const decrypted = await decryptEnvelope(user.tfaSecret as string);
    const issuerLabel = (await settingGet<string>("site_name", "Eficyent")) || "Eficyent";
    const otpauthUrl = qrService.totpUri(decrypted, `${issuerLabel}:${user.email}`);

    return sendResponse(res, "", 200, {
      // The original endpoint returned three QR forms. Server-rendered SVG/PNG
      // is unnecessary for a JSON API at scale - clients render from the URL.
      qr_code: otpauthUrl,
      tfa_secret: decrypted,
      qr_code_url: otpauthUrl,
      qr_code_png: null,
    });
  },

  async tfaStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PasswordVerificationInput;
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    if (!req.user.tfaSecret) throw new ApiException(138);
    const tfaOk = await totpService.verify(req.user.tfaSecret, body.verification_code);
    if (!tfaOk) throw new ApiException(139);

    const updated = await prisma().user.update({
      where: { id: req.user.id },
      data: {
        isTfaSetupCompleted: true,
        isTfaEnabled: !req.user.isTfaEnabled,
      },
    });
    const codes = updated.isTfaEnabled && updated.backupCodes
      ? updated.backupCodes.split(",")
      : [];
    return sendResponse(res, "Two-factor authentication updated.", 200, {
      backup_codes: codes,
    });
  },

  async regenerateBackupCodes(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as RegenerateBackupCodesInput;
    const ok = await passwordService.verify(req.user.password, body.password);
    if (!ok) throw new ApiException(125);
    if (!req.user.isTfaSetupCompleted) throw new ApiException(138);

    const codes = generateBackupCodes();
    await prisma().user.update({
      where: { id: req.user.id },
      data: { backupCodes: codes },
    });
    return sendResponse(res, "Backup codes regenerated successfully.", 200, {
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
    return sendResponse(res, "Tour status updated.", 200, []);
  },

  /**
   * Mirror of Api\\ProfileController::update_profile_form_fields.
   * The full dynamic-fields generator (FieldsHelper::updateProfileFormFields)
   * depends on FvBank/onboarding context that lands in Phase 3. For Phase 2
   * we return a minimal scaffold - clients can already round-trip uploads
   * through the update_profile endpoint below.
   */
  updateProfileFormFields(_req: Request, res: Response): Response {
    return sendResponse(res, "", 200, { form_fields: [] });
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
          await tx.userDocument.update({
            where: { id: existing.id },
            data,
          });
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
        req.user!.userType === USER_TYPE_BUSINESS &&
        body.business_verification_type
      ) {
        await tx.userInformation.update({
          where: { userId: req.user!.id },
          data: { businessVerificationType: body.business_verification_type },
        });
      }
    });

    const refreshed = await prisma().user.findUnique({
      where: { id: req.user.id },
    });
    if (!refreshed) throw new ApiException(102);

    logger.info(
      { userId: req.user.id.toString() },
      "Profile updated",
    );
    return sendResponse(res, "Profile updated successfully.", 200, {
      user: userResource(refreshed, METHOD_PROFILE),
    });
  },
};

function extractMime(dataUrl: string): string {
  const m = /^data:([^;]+);base64,/.exec(dataUrl);
  return m ? (m[1] ?? "application/octet-stream") : "application/octet-stream";
}
