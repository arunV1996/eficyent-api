import { body, query, ValidationChain } from "express-validator";
import { isDisposableEmail } from "../utils/common.utils";
import { PASSWORD_REGEX, USER_TITLES } from "../utils/constants";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chains for the /subusers surface — mirror of
 * validators/subuser/subuserValidators.ts.
 */


const NAME_REGEX = /^[A-Za-z\s]+$/;

/**
 * Keys accepted by POST /subusers/store (mirror of
 * SubUserStoreSchema.strict()).
 */
export const SUBUSER_STORE_ALLOWED_KEYS = [
    "title",
    "first_name",
    "middle_name",
    "last_name",
    "email",
    "mobile_country_code",
    "mobile",
];

export const subuserStoreBodyValidator: ValidationChain[] = [
    body("title")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn([...USER_TITLES])
        .withMessage(localizedError("1100", 1100)),

    body("first_name")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 255 })
        .matches(NAME_REGEX)
        .withMessage(localizedError("1100", 1100)),

    body("middle_name")
        .optional()
        .isString()
        .isLength({ max: 255 })
        .matches(NAME_REGEX)
        .withMessage(localizedError("1100", 1100)),

    body("last_name")
        .optional()
        .isString()
        .isLength({ max: 255 })
        .matches(NAME_REGEX)
        .withMessage(localizedError("1100", 1100)),

    body("email")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .trim()
        .toLowerCase()
        .isEmail()
        .withMessage(localizedError("1101", 1101))
        .bail()
        .isLength({ max: 255 })
        .custom((value) => !isDisposableEmail(String(value)))
        .withMessage(() => ({
            msg: "Please use a valid email address.",
            code: 422,
        })),

    body("mobile_country_code")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^\d{1,7}$/)
        .withMessage(localizedError("1100", 1100)),

    body("mobile")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^\d{8,15}$/)
        .withMessage(localizedError("1100", 1100)),
];

/**
 * GET /subusers/show + DELETE /subusers/delete (mirror of
 * SubUserShowSchema).
 */
export const subuserShowQueryValidator: ValidationChain[] = [
    query("subuser_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * Keys accepted by POST /subusers/accept-invite (mirror of
 * AcceptInviteSchema.strict()).
 */
export const ACCEPT_INVITE_ALLOWED_KEYS = [
    "invite_token",
    "password",
    "password_confirmation",
];

export const acceptInviteBodyValidator: ValidationChain[] = [
    body("invite_token")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 20, max: 2_000 })
        .withMessage(localizedError("1100", 1100)),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isLength({ min: 8, max: 128 })
        .withMessage(localizedError("1103", 1103))
        .bail()
        .matches(PASSWORD_REGEX)
        .withMessage(() => ({
            msg: "Password format is invalid.",
            code: 422,
        })),

    body("password_confirmation")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isLength({ min: 8, max: 128 })
        .custom((value, { req }) => value === req.body.password)
        .withMessage(() => ({
            msg: "Password confirmation does not match.",
            code: 422,
        })),
];
