import { body, query, ValidationChain } from "express-validator";
import {
    DEPOSIT_PURPOSE,
    DEPOSIT_SOURCE_OF_FUNDS,
    DEPOSIT_TYPE_MAP,
} from "../utils/constants";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chains for the /deposits surface — mirror of
 * validators/deposits/depositValidators.ts.
 */


const DOCUMENT_INPUT_MESSAGE =
    "Must be an HTTPS URL or a base64 image/PDF data URL.";

const isDocumentInput = (value: unknown): boolean => {
    if (typeof value !== "string" || value.length > 8 * 1024 * 1024) {
        return false;
    }
    return (
        value.startsWith("https://") ||
        /^data:(image\/(jpeg|jpg|png|gif)|application\/pdf);base64,/.test(
            value,
        )
    );
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
 * Keys accepted by POST /deposits/store (mirror of
 * DepositCreateSchema.strict()).
 */
export const DEPOSIT_STORE_ALLOWED_KEYS = [
    "bank_account_id",
    "amount",
    "type",
    "source_of_funds",
    "purpose_of_payment",
    "proof",
    "deposit_currency",
    "from_wallet_address",
    "to_wallet_id",
    "transaction_hash",
    "client_reference_id",
];

export const depositStoreBodyValidator: ValidationChain[] = [
    body("bank_account_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("amount")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isFloat({ min: 1, max: 10_000_000 })
        .withMessage(localizedError("1100", 1100))
        .toFloat(),

    body("type")
        .optional()
        .isIn(Object.keys(DEPOSIT_TYPE_MAP))
        .withMessage(localizedError("1100", 1100)),

    body("source_of_funds")
        .optional()
        .isIn(Object.keys(DEPOSIT_SOURCE_OF_FUNDS))
        .withMessage(localizedError("1100", 1100)),

    body("purpose_of_payment")
        .optional()
        .isIn(Object.keys(DEPOSIT_PURPOSE))
        .withMessage(localizedError("1100", 1100)),

    body("proof")
        .optional()
        .custom(isDocumentInput)
        .withMessage(() => ({ msg: DOCUMENT_INPUT_MESSAGE, code: 422 })),

    body("deposit_currency").optional().isString(),

    body("from_wallet_address").optional().isString().isLength({ max: 255 }),

    body("to_wallet_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("transaction_hash").optional().isString().isLength({ max: 255 }),

    body("client_reference_id").optional().isString().isLength({ max: 128 }),
];

/**
 * GET /deposits/quote (mirror of DepositQuoteSchema).
 */
export const depositQuoteQueryValidator: ValidationChain[] = [
    query("bank_account_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("amount")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isFloat({ min: 1, max: 10_000_000 })
        .withMessage(localizedError("1100", 1100))
        .toFloat(),

    query("deposit_currency").optional().isString(),
];

/**
 * GET /deposits/show (mirror of DepositShowSchema).
 */
export const depositShowQueryValidator: ValidationChain[] = [
    query("deposit_transaction_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * GET /deposits/list (mirror of DepositListQuerySchema).
 */
export const depositListQueryValidator: ValidationChain[] = [
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

    query("search_key").optional().isString().isLength({ max: 128 }),

    query("bank_account_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),

    query("type").optional().isString().isLength({ max: 20 }),
];
