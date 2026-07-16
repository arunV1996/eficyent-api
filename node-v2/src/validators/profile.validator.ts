import { body, ValidationChain } from "express-validator";
import { PASSWORD_REGEX } from "../utils/constants";
import { localizedError } from "./validation_message.helper";


/**
 * Body keys accepted by POST /change-password (mirror of the legacy
 * Zod ChangePasswordSchema's strict field set).
 */
const CHANGE_PASSWORD_ALLOWED_KEYS = new Set([
    "old_password",
    "password",
    "password_confirmation",
]);

/**
 * express-validator chain for POST /api/user/change-password.
 * Mirror of the legacy ChangePasswordSchema:
 *   old_password           string, 1..128
 *   password               PASSWORD_REGEX (upper + lower + digit +
 *                          symbol, 8+ chars)
 *   password_confirmation  string, 1..128, must equal password
 *   .strict()              unknown body keys rejected
 * The strict and confirmation rules run inside the chain so the route
 * middleware array stays [authSanctum, validateMerchant,
 * changePasswordValidator, checkValidationErrors].
 */
export const changePasswordValidator: ValidationChain[] = [
    // Zod .strict() equivalent: reject unrecognized body keys.
    body("old_password").custom((_, { req }) => {
        const requestBody = req.body;
        if (
            requestBody &&
            typeof requestBody === "object" &&
            !Array.isArray(requestBody)
        ) {
            const unknownKeys = Object.keys(requestBody).filter(
                (key) => !CHANGE_PASSWORD_ALLOWED_KEYS.has(key),
            );
            if (unknownKeys.length > 0) {
                throw new Error(
                    `Unrecognized key(s) in object: ${unknownKeys
                        .map((key) => `'${key}'`)
                        .join(", ")}`,
                );
            }
        }
        return true;
    }),

    body("old_password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 128 })
        .withMessage(() => ({
            msg: "old_password must be between 1 and 128 characters.",
            code: 422,
        })),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .matches(PASSWORD_REGEX)
        .withMessage(() => ({
            msg: "Password format is invalid.",
            code: 422,
        })),

    body("password_confirmation")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 128 })
        .withMessage(() => ({
            msg: "password_confirmation must be between 1 and 128 characters.",
            code: 422,
        }))
        .bail()
        .custom((value, { req }) => value === req.body.password)
        .withMessage(() => ({
            msg: "Password confirmation does not match.",
            code: 422,
        })),
];

/**
 * Keys accepted by POST /delete-account and
 * /regenerate-backup-codes (mirror of DeleteAccountSchema /
 * RegenerateBackupCodesSchema .strict()).
 */
export const PASSWORD_ONLY_ALLOWED_KEYS = ["password"];

export const passwordOnlyBodyValidator: ValidationChain[] = [
    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 128 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * Keys accepted by POST /tfa-status (mirror of
 * PasswordVerificationSchema.strict()).
 */
export const TFA_STATUS_ALLOWED_KEYS = ["password", "verification_code"];

export const passwordVerificationBodyValidator: ValidationChain[] = [
    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 128 })
        .withMessage(localizedError("1100", 1100)),

    body("verification_code")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 20 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * Keys accepted by POST /update-profile (mirror of
 * UpdateProfileSchema.strict() — permissive document blocks with
 * strict sub-keys).
 */
export const UPDATE_PROFILE_ALLOWED_KEYS = [
    "business_verification_type",
    "proof_of_address",
    "source_of_funds",
    "id_document",
    "proof_of_ownership",
];

const DOCUMENT_BLOCK_KEYS = new Set([
    "document_file",
    "document_back_file",
    "document_expiry_date",
]);

const isDocumentBlock = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    return Object.keys(value as Record<string, unknown>).every(
        (key) => DOCUMENT_BLOCK_KEYS.has(key),
    );
};

const DOCUMENT_BLOCK_MESSAGE =
    "Unrecognized key(s) in document object.";

export const updateProfileBodyValidator: ValidationChain[] = [
    body("business_verification_type")
        .optional()
        .isString()
        .isLength({ max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("proof_of_address")
        .optional()
        .custom(isDocumentBlock)
        .withMessage(() => ({ msg: DOCUMENT_BLOCK_MESSAGE, code: 422 })),

    body("source_of_funds")
        .optional()
        .custom(isDocumentBlock)
        .withMessage(() => ({ msg: DOCUMENT_BLOCK_MESSAGE, code: 422 })),

    body("id_document")
        .optional()
        .custom(isDocumentBlock)
        .withMessage(() => ({ msg: DOCUMENT_BLOCK_MESSAGE, code: 422 })),

    body("proof_of_ownership")
        .optional()
        .custom(isDocumentBlock)
        .withMessage(() => ({ msg: DOCUMENT_BLOCK_MESSAGE, code: 422 })),
];
