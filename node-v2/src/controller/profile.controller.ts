import { Request, Response } from "express";
import sequelize from "../config/database";
import { CodedError } from "../helpers/coded_error.helper";
import { decryptEnvelope, encryptEnvelope } from "../helpers/crypto.helper";
import { getBusinessModel } from "../helpers/merchant.helper";
import { generateQrDataUrl, totpUri } from "../helpers/qr.helper";
import { settingGet } from "../helpers/setting.helper";
import { revokeToken } from "../helpers/token.helper";
import {
    checkBackupCode,
    generateTotpSecret,
    verifyTotp,
} from "../helpers/totp.helper";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import UserDocument from "../models/user_document.model";
import UserInformation from "../models/user_information.model";
import {
    fullUserToJSON,
    statusUserToJSON,
} from "../resources/user.resource";
import { resolveKycDriver } from "../services/kyc.service";
import { upload } from "../services/s3.service";
import {
    comparePassword,
    generateBackupCodes,
    generateUniqueId,
    hashPassword,
} from "../utils/common.utils";
import {
    ACTIVE,
    ID_VERIFIED_BY_ADMIN,
    IDENTITY_VERIFICATION_COMPLETED,
    USER_TYPE_BUSINESS,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

/**
 * GET /api/user/profile
 *
 * Full profile payload: user fields + user/business information +
 * signed document URLs + merchant flags. Mirrors
 * profileController.profile in /node, including the empty-envelope
 * response shape {success, message, code: "", data}.
 */
export const profile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const userId = req.user.id;
        const [information, documents, merchant] = await Promise.all([
            UserInformation.findOne({ where: { userId } }),
            UserDocument.findAll({ where: { userId } }),
            Merchant.findOne({
                where: { userId },
                attributes: ["id"],
            }),
        ]);

        const businessModel = await getBusinessModel(
            merchant?.id ?? req.user.merchantId,
        );

        return res.sendEmptyEnvelope(
            {
                user: await fullUserToJSON(
                    req.user,
                    information,
                    documents,
                    !!merchant,
                    businessModel,
                ),
            },
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/change-password
 *
 * Verifies the current password, updates to a new hash, and revokes
 * the caller's active access token so the client is forced to log in
 * again with the new credentials. Mirrors profileController.changePassword
 * in /node exactly, including the "new password must not equal the old
 * password" guard.
 */
export const changePassword = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user || !req.tokenId) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const oldPassword = String(req.body.old_password);
        const newPassword = String(req.body.password);

        // We need the bcrypt hash for verification; the default scope
        // strips password, so query again with the withPassword scope.
        const userWithPassword = await User.scope("withPassword").findByPk(
            req.user.id,
        );

        if (!userWithPassword) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const oldPasswordMatches = await comparePassword(
            oldPassword,
            userWithPassword.password,
        );
        if (!oldPasswordMatches) {
            return res.sendError(res.__("125"), 125, 400);
        }

        const sameAsCurrent = await comparePassword(
            newPassword,
            userWithPassword.password,
        );
        if (sameAsCurrent) {
            return res.sendError(res.__("126"), 126, 400);
        }

        const newPasswordHash = await hashPassword(newPassword);
        userWithPassword.password = newPasswordHash;
        await userWithPassword.save();

        // Revoke the token that made this request (row + Redis session)
        // so the client must re-authenticate with the new password.
        await revokeToken(req.tokenId, req.user.id);

        return res.sendEmptyEnvelope({}, "Password changed successfully.");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/update-tour-status
 *
 * Marks the caller's onboarding tour as completed. If it's already
 * completed we return the 148 error code, matching the legacy
 * profileController.updateTourStatus behavior.
 */
export const updateTourStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        if (req.user.tourStatus === ACTIVE) {
            return res.sendError(res.__("148"), 148, 400);
        }

        req.user.tourStatus = ACTIVE;
        await req.user.save();

        return res.sendEmptyEnvelope({}, "Tour status updated successfully.");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/delete-account
 *
 * Password-gated soft delete; the email is rewritten to a tombstone so
 * it can be re-registered (mirror of the legacy deleteAccount).
 */
export const deleteAccount = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const passwordOk = await comparePassword(
            String(req.body.password),
            req.user.password,
        );
        if (!passwordOk) {
            return res.sendError(res.__("125"), 125, 400);
        }
        await User.update(
            {
                deletedAt: new Date(),
                email: `deleted+${req.user.id}@eficyent.invalid`,
            },
            { where: { id: req.user.id } },
        );
        return res.sendEmptyEnvelope({}, "Account deleted successfully.");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/check_user_status
 *
 * Re-polls an in-flight KYC verification, then returns the compact
 * status snapshot; individual users additionally get a fresh
 * id_verification_url when a KYC service is configured (mirror of the
 * legacy checkUserStatus).
 */
export const checkUserStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        let user = req.user;

        // 1. In-flight KYC re-poll (best-effort).
        if (
            user.idVerification !== IDENTITY_VERIFICATION_COMPLETED &&
            user.idVerifiedBy
        ) {
            try {
                const driver = resolveKycDriver(user.idVerifiedBy);
                await driver.status(user);
            } catch {
                // Return the cached status when the provider is down.
            }
            user = (await User.findByPk(user.id)) ?? user;
        }

        // 2. Context for the status shaper.
        const [information, merchant] = await Promise.all([
            UserInformation.findOne({ where: { userId: user.id } }),
            Merchant.findOne({
                where: { userId: user.id },
                attributes: ["id"],
            }),
        ]);
        const businessModel = await getBusinessModel(
            merchant?.id ?? user.merchantId,
        );
        const data: Record<string, unknown> = {
            user: statusUserToJSON(user, !!merchant, information, businessModel),
        };

        // 3. Fresh verification link for individual users.
        if (Number(user.userType) === USER_TYPE_PERSONAL) {
            const kycService = await settingGet<string>("kyc_service", "");
            if (kycService && kycService !== ID_VERIFIED_BY_ADMIN) {
                try {
                    const driver = resolveKycDriver(kycService);
                    const url = await driver.make(user);
                    data.id_verification_url = url || null;
                } catch {
                    // Link generation failure must not break the status
                    // response — mirror of the legacy catch.
                }
            }
        }

        return res.sendEmptyEnvelope(data, "");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/setup-tfa
 *
 * Provisions (or re-reads) the TOTP secret, returning the otpauth URI
 * and a QR PNG data URL. Legacy rows encrypted with an unreadable
 * cipher get a fresh secret (mirror of the legacy setupTfa).
 */
export const setupTfa = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        let user = req.user;
        if (!user.tfaSecret) {
            const secret = generateTotpSecret();
            const codes = generateBackupCodes();
            user.tfaSecret = await encryptEnvelope(secret);
            user.backupCodes = codes;
            user = await user.save();
        }

        let decryptedSecret: string;
        try {
            decryptedSecret = await decryptEnvelope(user.tfaSecret as string);
        } catch {
            const freshSecret = generateTotpSecret();
            const freshCodes = generateBackupCodes();
            user.tfaSecret = await encryptEnvelope(freshSecret);
            user.backupCodes = freshCodes;
            user = await user.save();
            decryptedSecret = freshSecret;
        }

        const issuerLabel =
            (await settingGet<string>("site_name", "EFICyent")) || "EFICyent";
        const otpauthUrl = totpUri(decryptedSecret, user.email, issuerLabel);
        const qrDataUrl = await generateQrDataUrl(otpauthUrl);

        return res.sendEmptyEnvelope(
            {
                qr_code: qrDataUrl,
                tfa_secret: decryptedSecret,
                qr_code_url: otpauthUrl,
                qr_code_png: qrDataUrl,
            },
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/tfa-status
 *
 * Password + TOTP (or backup code) verification toggles TFA on/off.
 * Enabling returns the backup codes (mirror of the legacy tfaStatus).
 */
export const tfaStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const passwordOk = await comparePassword(
            String(req.body.password),
            req.user.password,
        );
        if (!passwordOk) {
            return res.sendError(res.__("125"), 125, 400);
        }
        if (!req.user.tfaSecret) {
            return res.sendError(
                "Two-factor authentication is not configured.",
                138,
                400,
            );
        }

        const verificationCode = String(req.body.verification_code);
        let tfaOk = await verifyTotp(req.user.tfaSecret, verificationCode);
        if (!tfaOk && req.user.backupCodes) {
            let plaintextCodes = req.user.backupCodes;
            if (!/^\d{6}(,\d{6})*$/.test(plaintextCodes)) {
                try {
                    plaintextCodes = await decryptEnvelope(plaintextCodes);
                } catch {
                    // Keep the stored value — the backup check will
                    // simply not match.
                }
            }
            const backupCheck = checkBackupCode(
                plaintextCodes,
                verificationCode,
            );
            if (backupCheck.ok) {
                tfaOk = true;
                const encryptedRemaining = backupCheck.remaining
                    ? await encryptEnvelope(backupCheck.remaining)
                    : null;
                await User.update(
                    { backupCodes: encryptedRemaining },
                    { where: { id: req.user.id } },
                );
            }
        }
        if (!tfaOk) {
            return res.sendError(res.__("139"), 139, 400);
        }

        const isCurrentlyEnabled = Boolean(req.user.isTfaEnabled);
        const becomingEnabled = !isCurrentlyEnabled;

        await User.update(
            {
                isTfaSetupCompleted: true,
                isTfaEnabled: becomingEnabled,
            },
            { where: { id: req.user.id } },
        );
        const updated = await User.findByPk(req.user.id);

        const message = becomingEnabled
            ? "TFA has been enabled successfully."
            : "TFA has been disabled successfully.";

        const data: Record<string, unknown> = {};
        if (becomingEnabled && updated?.backupCodes) {
            let plaintextCodes = updated.backupCodes;
            if (!/^\d{6}(,\d{6})*$/.test(plaintextCodes)) {
                try {
                    plaintextCodes = await decryptEnvelope(plaintextCodes);
                } catch {
                    // Keep the stored value.
                }
            }
            data["backup_codes"] = plaintextCodes.split(",");
        }

        return res.sendEmptyEnvelope(data, message);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/regenerate-backup-codes
 */
export const regenerateBackupCodes = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const passwordOk = await comparePassword(
            String(req.body.password),
            req.user.password,
        );
        if (!passwordOk) {
            return res.sendError(res.__("125"), 125, 400);
        }
        if (!req.user.isTfaSetupCompleted) {
            return res.sendError(
                "Two-factor authentication is not configured.",
                138,
                400,
            );
        }

        const codes = generateBackupCodes();
        const encryptedCodes = await encryptEnvelope(codes);
        await User.update(
            { backupCodes: encryptedCodes },
            { where: { id: req.user.id } },
        );
        return res.sendEmptyEnvelope(
            { backup_codes: codes.split(",") },
            "Backup codes regenerated successfully.",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

const PROFILE_DOCUMENT_CHILD_OPTIONS = {
    is_repeatable: false,
    field_value: "",
    parent_key: "",
    required_if_empty_of: "",
    required_if: "",
    values_supported: [],
    children: [],
    category: "",
};

/**
 * GET /api/user/update-profile-form-fields
 *
 * The re-upload form: for each expected document, only the missing
 * pieces (back file / expiry date) are asked for; business users
 * without a verification type also get that selector (mirror of the
 * legacy updateProfileFormFields, whose static field shapes are
 * emitted verbatim).
 */
export const updateProfileFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const today = new Date().toISOString().split("T")[0];
        const isBusiness = Number(req.user.userType) === USER_TYPE_BUSINESS;

        const [existingDocuments, information] = await Promise.all([
            UserDocument.findAll({ where: { userId: req.user.id } }),
            UserInformation.findOne({ where: { userId: req.user.id } }),
        ]);

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
            ...PROFILE_DOCUMENT_CHILD_OPTIONS,
        };

        const expiryDateChild = {
            field_key: "document_expiry_date",
            field_label: "Document Expiry Date",
            field_type: "date",
            is_mandatory: true,
            is_editable: true,
            validation: { min_date: today },
            ...PROFILE_DOCUMENT_CHILD_OPTIONS,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawFields: any[] = [
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fields: any[] = [];
        for (const field of rawFields) {
            const document = existingDocuments.find(
                (candidate) => candidate.documentName === field.field_key,
            );
            if (document) {
                const remainingChildren = [];
                if (!document.documentBackFile) {
                    remainingChildren.push(backFileChild);
                }
                if (!document.documentExpiryDate) {
                    remainingChildren.push(expiryDateChild);
                }
                if (remainingChildren.length > 0) {
                    fields.push({ ...field, children: remainingChildren });
                }
            } else {
                fields.push(field);
            }
        }

        if (
            isBusiness &&
            (!information || !information.businessVerificationType)
        ) {
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
                    { label: "Bylaws", value: "Bylaws" },
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

        return res.sendEmptyEnvelope({ form_fields: fields }, "");
    } catch (error) {
        return res.handleError(error);
    }
};

const extractMime = (dataUrl: string): string => {
    const match = /^data:([^;]+);base64,/.exec(dataUrl);
    return match ? (match[1] ?? "application/octet-stream") : "application/octet-stream";
};

const uploadDocumentInput = async (input: string): Promise<string | null> => {
    if (!input.startsWith("data:")) {
        return input;
    }
    try {
        return await upload(
            {
                buffer: Buffer.from(input.split(",")[1] ?? "", "base64"),
                contentType: extractMime(input),
            },
            "user_documents",
        );
    } catch {
        return null;
    }
};

/**
 * POST /api/user/update-profile
 *
 * Upserts the submitted document blocks (S3 upload for data: URLs) and
 * the business verification type, then returns the refreshed full user
 * (mirror of the legacy updateProfile).
 */
export const updateProfile = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const body = req.body as Record<
            string,
            | { document_file?: string; document_back_file?: string; document_expiry_date?: string }
            | string
            | undefined
        >;

        try {
            await sequelize.transaction(async (databaseTransaction) => {
                for (const [documentName, documentData] of Object.entries(
                    body,
                )) {
                    if (
                        documentName === "business_verification_type" ||
                        !documentData ||
                        typeof documentData !== "object"
                    ) {
                        continue;
                    }
                    const updateData: {
                        documentFile?: string;
                        documentBackFile?: string;
                        documentExpiryDate?: Date;
                    } = {};
                    if (documentData.document_file) {
                        const url = await uploadDocumentInput(
                            documentData.document_file,
                        );
                        if (!url) {
                            throw new CodedError(
                                "File upload failed.",
                                109,
                                400,
                            );
                        }
                        updateData.documentFile = url;
                    }
                    if (documentData.document_back_file) {
                        const url = await uploadDocumentInput(
                            documentData.document_back_file,
                        );
                        if (!url) {
                            throw new CodedError(
                                "File upload failed.",
                                109,
                                400,
                            );
                        }
                        updateData.documentBackFile = url;
                    }
                    if (documentData.document_expiry_date) {
                        const expiryDate = new Date(
                            documentData.document_expiry_date,
                        );
                        if (!Number.isNaN(expiryDate.getTime())) {
                            updateData.documentExpiryDate = expiryDate;
                        }
                    }
                    const existing = await UserDocument.findOne({
                        where: { userId: req.user!.id, documentName },
                        transaction: databaseTransaction,
                    });
                    if (existing) {
                        await existing.update(updateData, {
                            transaction: databaseTransaction,
                        });
                    } else {
                        await UserDocument.create(
                            {
                                uniqueId: generateUniqueId(24),
                                userId: req.user!.id,
                                documentName,
                                ...updateData,
                            },
                            { transaction: databaseTransaction },
                        );
                    }
                }

                if (
                    Number(req.user!.userType) === USER_TYPE_BUSINESS &&
                    body.business_verification_type
                ) {
                    const existingInformation = await UserInformation.findOne({
                        where: { userId: req.user!.id },
                        transaction: databaseTransaction,
                    });
                    if (existingInformation) {
                        await existingInformation.update(
                            {
                                businessVerificationType: String(
                                    body.business_verification_type,
                                ),
                            },
                            { transaction: databaseTransaction },
                        );
                    } else {
                        await UserInformation.create(
                            {
                                uniqueId: generateUniqueId(24),
                                userId: req.user!.id,
                                businessVerificationType: String(
                                    body.business_verification_type,
                                ),
                            },
                            { transaction: databaseTransaction },
                        );
                    }
                }
            });
        } catch (transactionError) {
            if (transactionError instanceof CodedError) {
                return res.sendError(
                    transactionError.message,
                    transactionError.errorCode,
                    transactionError.httpStatus,
                );
            }
            throw transactionError;
        }

        const [refreshed, information, documents, merchant] =
            await Promise.all([
                User.findByPk(req.user.id),
                UserInformation.findOne({ where: { userId: req.user.id } }),
                UserDocument.findAll({ where: { userId: req.user.id } }),
                Merchant.findOne({
                    where: { userId: req.user.id },
                    attributes: ["id"],
                }),
            ]);
        if (!refreshed) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const businessModel = await getBusinessModel(
            merchant?.id ?? refreshed.merchantId,
        );
        return res.sendEmptyEnvelope(
            {
                user: await fullUserToJSON(
                    refreshed,
                    information,
                    documents,
                    !!merchant,
                    businessModel,
                ),
            },
            "Profile updated successfully.",
        );
    } catch (error) {
        return res.handleError(error);
    }
};
