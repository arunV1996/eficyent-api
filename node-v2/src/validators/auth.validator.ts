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

const emailRule = () =>
    body("email")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isEmail()
        .withMessage(localizedError("1101", 1101));

const sixDigitCode = (field: string) =>
    body(field)
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^\d{6}$/)
        .withMessage(() => ({ msg: "Must be a 6-digit code.", code: 422 }));

export const registerValidator: ValidationChain[] = [
    emailRule(),
    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 8 })
        .withMessage(localizedError("1103", 1103)),
];

export const loginValidator: ValidationChain[] = [
    emailRule(),
    body("password").notEmpty().withMessage(localizedError("1100", 1100)),
];

/** POST /tfa-login */
export const tfaLoginValidator: ValidationChain[] = [
    emailRule(),
    sixDigitCode("verification_code"),
];

/** POST /verify-otp */
export const verifyOtpValidator: ValidationChain[] = [
    emailRule(),
    sixDigitCode("otp"),
];

/** POST /resend-otp and /forgot-password/send-reset-link */
export const emailOnlyValidator: ValidationChain[] = [emailRule()];

/** POST /forgot-password/verify-code */
export const verifyCodeValidator: ValidationChain[] = [
    emailRule(),
    sixDigitCode("verification_code"),
];

/** POST /forgot-password/reset-password */
export const resetPasswordValidator: ValidationChain[] = [
    body("reset_token")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 20, max: 200 }),
    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 8 })
        .withMessage(localizedError("1103", 1103)),
];
