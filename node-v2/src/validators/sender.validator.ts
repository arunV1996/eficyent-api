import { body, query, ValidationChain } from "express-validator";
import { USER_TYPE_MAP } from "../utils/constants";

/**
 * express-validator chains for the /remitters surface — mirror of
 * validators/senders/senderValidators.ts.
 */

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

/**
 * GET /remitters/get-form-fields (mirror of
 * SenderFormFieldsQuerySchema, including the type-or-remitter_id
 * refinement).
 */
export const senderFormFieldsQueryValidator: ValidationChain[] = [
    query("type")
        .optional()
        .isIn(Object.keys(USER_TYPE_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("remitter_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("type").custom((_value, { req }) => {
        const requestQuery = (req.query ?? {}) as Record<string, unknown>;
        return Boolean(requestQuery.type ?? requestQuery.remitter_id);
    }).withMessage(() => ({
        msg: "type or remitter_id required",
        code: 422,
    })),
];

/**
 * GET /remitters/show + DELETE /remitters/delete (mirror of
 * SenderShowQuerySchema — exactly one identifier).
 */
export const senderShowQueryValidator: ValidationChain[] = [
    query("remitter_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("id_number")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("email")
        .optional()
        .isEmail()
        .withMessage(localizedError("1101", 1101)),

    query("remitter_id").custom((_value, { req }) => {
        const requestQuery = (req.query ?? {}) as Record<string, unknown>;
        const provided = [
            requestQuery.remitter_id,
            requestQuery.id_number,
            requestQuery.email,
        ].filter(Boolean).length;
        return provided === 1;
    }).withMessage(() => ({
        msg: "Exactly one of remitter_id, id_number, email is required.",
        code: 422,
    })),
];

/**
 * GET /remitters/list (mirror of SenderListQuerySchema).
 */
export const senderListQueryValidator: ValidationChain[] = [
    query("type")
        .optional()
        .isIn(Object.keys(USER_TYPE_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("status").optional().isString(),

    query("search_key").optional().isString().isLength({ max: 128 }),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),
];

/**
 * POST /remitters/update — remitter_id is required, the rest of the
 * body passes through to the dynamic sender validation (mirror of the
 * passthrough SenderUpdateBodySchema).
 */
export const senderUpdateBodyValidator: ValidationChain[] = [
    body("remitter_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];
