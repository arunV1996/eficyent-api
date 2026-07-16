import { body, query, ValidationChain } from "express-validator";
import {
    PASSWORD_REGEX,
    TEAM_MEMBER_STATUS_MAP,
    USER_PERMISSION_MAP,
    USER_ROLE_MAP,
} from "../utils/constants";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chains for the team surface — mirror of
 * validators/team/teamAuthValidators.ts +
 * teamMemberCrudValidators.ts.
 */


const PASSWORD_FORMAT_MESSAGE = "Password format is invalid.";
const CONFIRMATION_MESSAGE = "Password confirmation does not match.";

const emailChain = (chain: ValidationChain): ValidationChain =>
    chain
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .trim()
        .toLowerCase()
        .isEmail()
        .withMessage(localizedError("1101", 1101))
        .bail()
        .isLength({ min: 3, max: 254 })
        .withMessage(localizedError("1101", 1101));

const strongPassword = (chain: ValidationChain): ValidationChain =>
    chain
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isLength({ min: 8, max: 128 })
        .withMessage(localizedError("1103", 1103))
        .bail()
        .matches(PASSWORD_REGEX)
        .withMessage(() => ({ msg: PASSWORD_FORMAT_MESSAGE, code: 422 }));

// ─── Auth ───────────────────────────────────────────────────────────

export const TEAM_LOGIN_ALLOWED_KEYS = [
    "email",
    "password",
    "device_id",
    "device_type",
];

export const teamLoginBodyValidator: ValidationChain[] = [
    emailChain(body("email")),

    body("password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isLength({ min: 1, max: 128 })
        .withMessage(localizedError("1100", 1100)),

    body("device_id").optional().isString().isLength({ max: 255 }),

    body("device_type")
        .optional()
        .isIn(["android", "ios", "web"])
        .withMessage(localizedError("1100", 1100)),
];

export const FORCE_RESET_ALLOWED_KEYS = [
    "email",
    "password",
    "password_confirmation",
];

export const forceResetPasswordBodyValidator: ValidationChain[] = [
    emailChain(body("email")),

    strongPassword(body("password")),

    body("password_confirmation")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .custom((value, { req }) => value === req.body.password)
        .withMessage(() => ({ msg: CONFIRMATION_MESSAGE, code: 422 })),
];

export const TEAM_FORGOT_ALLOWED_KEYS = ["email"];

export const teamForgotPasswordBodyValidator: ValidationChain[] = [
    emailChain(body("email")),
];

export const TEAM_VERIFY_CODE_ALLOWED_KEYS = ["email", "verification_code"];

export const teamVerifyCodeBodyValidator: ValidationChain[] = [
    emailChain(body("email")),

    body("verification_code")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^\d{6}$/)
        .withMessage(localizedError("1100", 1100)),
];

export const TEAM_RESET_PASSWORD_ALLOWED_KEYS = [
    "reset_token",
    "password",
    "password_confirmation",
];

export const teamResetPasswordBodyValidator: ValidationChain[] = [
    body("reset_token")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 20, max: 200 })
        .withMessage(localizedError("1100", 1100)),

    strongPassword(body("password")),

    body("password_confirmation")
        .optional()
        .custom((value, { req }) => !value || value === req.body.password)
        .withMessage(() => ({ msg: CONFIRMATION_MESSAGE, code: 422 })),
];

export const TEAM_CHANGE_PASSWORD_ALLOWED_KEYS = [
    "old_password",
    "password",
    "password_confirmation",
];

export const teamChangePasswordBodyValidator: ValidationChain[] = [
    body("old_password")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isLength({ min: 1, max: 128 })
        .withMessage(localizedError("1100", 1100)),

    strongPassword(body("password")),

    body("password_confirmation")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .custom((value, { req }) => value === req.body.password)
        .withMessage(() => ({ msg: CONFIRMATION_MESSAGE, code: 422 })),
];

// ─── TeamMember CRUD ────────────────────────────────────────────────

export const TEAM_MEMBER_CREATE_ALLOWED_KEYS = [
    "name",
    "email",
    "role",
    "permission",
    "password",
    "password_confirmation",
    "mobile_country_code",
    "mobile",
    "remitter_id",
];

export const teamMemberCreateBodyValidator: ValidationChain[] = [
    body("name")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 255 })
        .withMessage(localizedError("1100", 1100)),

    emailChain(body("email")),

    body("role")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(USER_ROLE_MAP))
        .withMessage(localizedError("1100", 1100)),

    body("permission")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(USER_PERMISSION_MAP))
        .withMessage(localizedError("1100", 1100)),

    strongPassword(body("password")),

    body("password_confirmation")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .custom((value, { req }) => value === req.body.password)
        .withMessage(() => ({ msg: CONFIRMATION_MESSAGE, code: 422 })),

    body("mobile_country_code")
        .optional()
        .matches(/^\d{1,7}$/)
        .withMessage(localizedError("1100", 1100)),

    body("mobile")
        .optional()
        .matches(/^\d{8,15}$/)
        .withMessage(localizedError("1100", 1100)),

    body("remitter_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("remitter_id").custom((_value, { req }) => {
        const requestBody = (req.body ?? {}) as Record<string, unknown>;
        return (
            requestBody.role !== "CORPORATE" ||
            Boolean(requestBody.remitter_id)
        );
    }).withMessage(() => ({
        msg: "remitter_id is required for CORPORATE role.",
        code: 422,
    })),
];

export const TEAM_MEMBER_UPDATE_ALLOWED_KEYS = [
    "team_member_id",
    "name",
    "email",
    "role",
    "permission",
    "status",
    "mobile_country_code",
    "mobile",
];

export const teamMemberUpdateBodyValidator: ValidationChain[] = [
    body("team_member_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("name")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 255 })
        .withMessage(localizedError("1100", 1100)),

    emailChain(body("email")),

    body("role")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(USER_ROLE_MAP))
        .withMessage(localizedError("1100", 1100)),

    body("permission")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(USER_PERMISSION_MAP))
        .withMessage(localizedError("1100", 1100)),

    body("status")
        .optional()
        .isIn(Object.keys(TEAM_MEMBER_STATUS_MAP))
        .withMessage(localizedError("1100", 1100)),

    body("mobile_country_code")
        .optional()
        .matches(/^\d{1,7}$/)
        .withMessage(localizedError("1100", 1100)),

    body("mobile")
        .optional()
        .matches(/^\d{8,15}$/)
        .withMessage(localizedError("1100", 1100)),
];

export const TEAM_MEMBER_SHOW_ALLOWED_KEYS = ["team_member_id"];

export const teamMemberShowQueryValidator: ValidationChain[] = [
    query("team_member_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];

export const teamMemberShowBodyValidator: ValidationChain[] = [
    body("team_member_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];

export const teamMemberListQueryValidator: ValidationChain[] = [
    query("status")
        .optional()
        .isIn(Object.keys(TEAM_MEMBER_STATUS_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("role")
        .optional()
        .isIn(Object.keys(USER_ROLE_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("permission")
        .optional()
        .isIn(Object.keys(USER_PERMISSION_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("search_key").optional().isString().isLength({ max: 128 }),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),
];
