import { body, query, ValidationChain } from "express-validator";
import {
    EXTERNAL_TYPE_CALIZA,
    EXTERNAL_TYPE_FVBANK,
    EXTERNAL_TYPE_MASSIVE,
    EXTERNAL_TYPE_PROCESSING_UNIT,
} from "../utils/constants";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chains for the /accounts surface — mirror of
 * validators/virtualAccounts/virtualAccountValidators.ts.
 */


// Query strings only ever carry the string variants of the legacy
// boolean-coercion union.
const BOOLEAN_LIKE_VALUES = ["true", "false", "1", "0"];

/**
 * GET /accounts/list (mirror of VirtualAccountListSchema).
 */
export const virtualAccountListQueryValidator: ValidationChain[] = [
    query("country").optional().isString().isLength({ max: 100 }),

    query("currency").optional().isString().isLength({ max: 100 }),

    query("account_number").optional().isString().isLength({ max: 64 }),

    query("account_holder_name").optional().isString().isLength({ max: 255 }),

    query("account_bank_name").optional().isString().isLength({ max: 255 }),

    query("status").optional().isString().isLength({ max: 64 }),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),

    query("with_balance")
        .optional()
        .isIn(BOOLEAN_LIKE_VALUES)
        .withMessage(localizedError("1100", 1100)),
];

/**
 * GET /accounts/show + /accounts/get_account_balance (mirror of
 * VirtualAccountIdSchema).
 */
export const virtualAccountIdQueryValidator: ValidationChain[] = [
    query("unique_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("with_balance")
        .optional()
        .isIn(BOOLEAN_LIKE_VALUES)
        .withMessage(localizedError("1100", 1100)),
];

/**
 * Keys accepted by POST /accounts/activate (mirror of
 * ActivateSchema.strict()).
 */
export const ACTIVATE_ALLOWED_KEYS = ["type"];

export const activateBodyValidator: ValidationChain[] = [
    // Provider codes are the string identifiers only — raw integers
    // are rejected by the enum check.
    body("type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn([
            EXTERNAL_TYPE_CALIZA,
            EXTERNAL_TYPE_FVBANK,
            EXTERNAL_TYPE_MASSIVE,
            EXTERNAL_TYPE_PROCESSING_UNIT,
        ])
        .withMessage(localizedError("1100", 1100)),
];
