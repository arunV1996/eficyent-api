import { body, ValidationChain } from "express-validator";

/**
 * Localized error factory used by every rule. Returns the `{msg, code}`
 * shape that our checkValidationErrors middleware understands.
 */
const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

/**
 * express-validator chain for POST /api/user/register.
 */
export const registerValidator: ValidationChain[] = [
    body("email")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isEmail()
        .withMessage(localizedError("1101", 1101)),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 8 })
        .withMessage(localizedError("1103", 1103)),
];

/**
 * express-validator chain for POST /api/user/login.
 */
export const loginValidator: ValidationChain[] = [
    body("email")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isEmail()
        .withMessage(localizedError("1101", 1101)),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100)),
];
