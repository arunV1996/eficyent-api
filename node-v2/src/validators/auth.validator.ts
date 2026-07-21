import { body, ValidationChain } from "express-validator";
import { USER_TYPE_BUSINESS, USER_TYPE_PENDING } from "../utils/constants";
import { localizedError } from "./validation_message.helper";


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

/**
 * Body keys accepted by POST /register (mirror of the legacy Zod
 * RegisterSchema's strict field set — enforced via strictBody).
 */
export const REGISTER_ALLOWED_KEYS = [
    "email",
    "password",
    "password_confirmation",
    "title",
    "first_name",
    "middle_name",
    "last_name",
    "mobile_country_code",
    "mobile",
    "user_type",
    "timezone",
    "country",
    "device_id",
    "device_type",
];

export const registerValidator: ValidationChain[] = [
    emailRule(),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 8, max: 128 })
        .withMessage(localizedError("1103", 1103))
        .bail()
        // At least one upper, one lower, one digit, one symbol
        // (mirror of the legacy Zod password regex).
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
        .withMessage(() => ({
            msg: "Password must include upper, lower, digit, and symbol.",
            code: 422,
        })),

    // Mandatory, mirrors the password rules exactly, and must match
    // the password field.
    body("password_confirmation")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 8, max: 128 })
        .withMessage(localizedError("1103", 1103))
        .bail()
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
        .withMessage(() => ({
            msg: "Password must include upper, lower, digit, and symbol.",
            code: 422,
        }))
        .bail()
        .custom((value, { req }) => value === req.body.password)
        .withMessage(() => ({
            msg: "Password confirmation does not match.",
            code: 422,
        })),

    body("title").optional().isString().isLength({ max: 5 }),

    body("first_name").optional().isString().isLength({ min: 1, max: 100 }),

    body("middle_name").optional().isString().isLength({ max: 100 }),

    body("last_name").optional().isString().isLength({ max: 100 }),

    body("mobile_country_code").optional().isString().isLength({ max: 8 }),

    body("mobile").optional().isString().isLength({ min: 4, max: 20 }),

    body("user_type")
        .optional()
        .customSanitizer((value) => {
            // "BUSINESS" (quoted or not) -> numeric constant; numerics
            // pass through (mirror of the legacy Zod preprocess).
            if (typeof value === "string") {
                const normalized = value
                    .trim()
                    .replace(/^["']|["']$/g, "")
                    .toUpperCase();
                if (normalized === "BUSINESS") {
                    return USER_TYPE_BUSINESS;
                }
            }
            return Number(value);
        })
        .custom((value) =>
            value === USER_TYPE_PENDING || value === USER_TYPE_BUSINESS,
        )
        .withMessage(() => ({ msg: "Invalid user_type.", code: 422 })),

    body("timezone").optional().isString().isLength({ max: 30 }),

    body("country").optional().isString().isLength({ min: 2, max: 3 }),

    body("device_id").optional().isString().isLength({ max: 255 }),

    body("device_type")
        .optional()
        .isIn(["android", "ios", "web"])
        .withMessage(() => ({ msg: "Invalid device_type.", code: 422 })),
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
