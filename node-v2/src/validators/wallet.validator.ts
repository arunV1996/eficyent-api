import { body, query, ValidationChain } from "express-validator";
import { TRANSACTION_TYPE_MAP } from "../utils/constants";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chains for the /wallets surface — mirror of
 * validators/wallets/walletValidators.ts.
 */


// Query params always arrive as strings, so only the string literals
// from the legacy zod union are reachable ("true"/"false"); the
// boolean/numeric branches only ever matched JSON bodies.
const BOOLEAN_LIKE_VALUES = ["true", "false"];

const FLEXIBLE_DATE_MESSAGE = "Must be in YYYY-MM-DD or DD-MM-YYYY format.";

const isFlexibleDate = (value: unknown): boolean => {
    const stringValue = String(value);
    return (
        /^\d{4}-\d{2}-\d{2}$/.test(stringValue) ||
        /^\d{2}-\d{2}-\d{4}$/.test(stringValue)
    );
};

const normalizeFlexibleDate = (value: unknown): unknown => {
    const stringValue = String(value);
    if (/^\d{2}-\d{2}-\d{4}$/.test(stringValue)) {
        const [day, month, year] = stringValue.split("-");
        return `${year}-${month}-${day}`;
    }
    return value;
};

/**
 * GET /wallets/list (mirror of WalletListQuerySchema).
 */
export const walletListQueryValidator: ValidationChain[] = [
    query("status").optional().isString().isLength({ max: 64 }),

    query("currency")
        .optional()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),

    query("search_key").optional().isString().isLength({ max: 64 }),

    query("only_with_balance")
        .optional()
        .isIn(BOOLEAN_LIKE_VALUES)
        .withMessage(localizedError("1100", 1100)),

    // Boolean-like: true/false, "true"/"false", 1/0, "1"/"0".
    query("deal_based")
        .optional()
        .custom((value) =>
            [true, false, "true", "false", 1, 0, "1", "0"].includes(
                value as never,
            ),
        )
        .withMessage(localizedError("1104", 1104)),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),
];

/**
 * GET /wallets/show (mirror of WalletShowSchema).
 */
export const walletShowQueryValidator: ValidationChain[] = [
    query("wallet_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("with_balance")
        .optional()
        .isIn(BOOLEAN_LIKE_VALUES)
        .withMessage(localizedError("1100", 1100)),
];

/**
 * Keys accepted by POST /wallets/convert (mirror of
 * ConvertSchema.strict()).
 */
export const WALLET_CONVERT_ALLOWED_KEYS = ["quote_id"];

export const walletConvertBodyValidator: ValidationChain[] = [
    body("quote_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * GET /wallets/transactions/list (mirror of
 * WalletTransactionsQuerySchema). `status` accepts either the numeric
 * value or a label token — resolved in the controller.
 */
export const walletTransactionsQueryValidator: ValidationChain[] = [
    query("wallet_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    // String enum only (raw 1/2 are rejected); mapped to the DB
    // integers (DEBIT -> 1, CREDIT -> 2) for the controller.
    query("transaction_type")
        .optional()
        .isIn(Object.keys(TRANSACTION_TYPE_MAP))
        .withMessage(localizedError("1100", 1100))
        .customSanitizer((value) => TRANSACTION_TYPE_MAP[String(value)]),

    query("status").optional().isString().isLength({ max: 64 }),

    query("from_date")
        .optional()
        .custom(isFlexibleDate)
        .withMessage(() => ({ msg: FLEXIBLE_DATE_MESSAGE, code: 422 }))
        .customSanitizer(normalizeFlexibleDate),

    query("to_date")
        .optional()
        .custom(isFlexibleDate)
        .withMessage(() => ({ msg: FLEXIBLE_DATE_MESSAGE, code: 422 }))
        .customSanitizer(normalizeFlexibleDate),

    query("search_key").optional().isString().isLength({ max: 64 }),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),
];

/**
 * GET /wallets/transactions/show (mirror of
 * WalletTransactionShowSchema).
 */
export const walletTransactionShowQueryValidator: ValidationChain[] = [
    query("wallet_transaction_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];
