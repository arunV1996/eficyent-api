import { body, ValidationChain } from "express-validator";

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

/**
 * express-validator chain for POST /api/user/change-password.
 * Matches the request-body contract of the legacy
 * validators/profile/profileValidators.ts ChangePasswordSchema.
 */
export const changePasswordValidator: ValidationChain[] = [
    body("old_password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100)),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 8 })
        .withMessage(localizedError("1103", 1103)),
];
