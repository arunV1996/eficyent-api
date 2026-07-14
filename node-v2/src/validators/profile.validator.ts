import { body, ValidationChain } from "express-validator";
import { PASSWORD_REGEX } from "../utils/constants";

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

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
