import { query, ValidationChain } from "express-validator";
import { TRANSACTION_TYPE_MAP } from "../utils/constants";

/**
 * express-validator chains for the /ledgers surface — mirror of
 * validators/ledgers/ledgerValidators.ts.
 */

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

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
 * GET /ledgers/list (mirror of LedgerListSchema, including the
 * one-source refinements).
 */
export const ledgerListQueryValidator: ValidationChain[] = [
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

    query("transaction_type")
        .optional()
        .isIn(Object.keys(TRANSACTION_TYPE_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("search_key").optional().isString().isLength({ max: 128 }),

    query("bank_account_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("wallet_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),

    query("type").optional().isString().isLength({ max: 20 }),

    query("receiving_currency").optional().isString().isLength({ max: 10 }),

    query("bank_account_id").custom((_value, { req }) => {
        const requestQuery = (req.query ?? {}) as Record<string, unknown>;
        return Boolean(
            requestQuery.bank_account_id ?? requestQuery.wallet_id,
        );
    }).withMessage(() => ({
        msg: "Either bank_account_id or wallet_id is required.",
        code: 422,
    })),

    query("wallet_id").custom((_value, { req }) => {
        const requestQuery = (req.query ?? {}) as Record<string, unknown>;
        return !(requestQuery.bank_account_id && requestQuery.wallet_id);
    }).withMessage(() => ({
        msg: "Either bank_account_id or wallet_id - not both.",
        code: 422,
    })),
];

/**
 * GET /ledgers/show (mirror of LedgerShowSchema).
 */
export const ledgerShowQueryValidator: ValidationChain[] = [
    query("ledger_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];
