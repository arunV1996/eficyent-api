import { body, query, ValidationChain } from "express-validator";
import { BENEFICIARY_TRANSACTION_APPROVAL_MAP } from "../utils/constants";

/**
 * express-validator chains for the /beneficiary-transactions surface —
 * mirror of validators/payout/payoutValidators.ts (PayoutStoreSchema,
 * PayoutShowSchema, PayoutListQuerySchema, PayoutCancelSchema,
 * PayoutUpdateStatusSchema and the transaction-proof schemas).
 */

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

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
 * Keys accepted by POST /beneficiary-transactions/store (mirror of
 * PayoutStoreSchema.strict()).
 */
export const TRANSACTION_STORE_ALLOWED_KEYS = [
    "beneficiary_account_id",
    "quote_id",
    "remitter_id",
    "remarks",
    "supporting_document",
    "txn_ref_no",
    "purpose_of_payment",
    "client_reference_id",
    "verification_code",
];

export const transactionStoreBodyValidator: ValidationChain[] = [
    body("beneficiary_account_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("quote_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("remitter_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("remarks").optional().isString().isLength({ max: 255 }),

    body("supporting_document")
        .optional()
        .custom(isDocumentInput)
        .withMessage(() => ({ msg: DOCUMENT_INPUT_MESSAGE, code: 422 })),

    body("txn_ref_no").optional().isString().isLength({ max: 255 }),

    body("purpose_of_payment").optional().isString().isLength({ max: 255 }),

    body("client_reference_id").optional().isString().isLength({ max: 255 }),

    body("verification_code")
        .optional()
        .matches(/^\d{6}$/)
        .withMessage(localizedError("1100", 1100)),
];

/**
 * GET /beneficiary-transactions/show|check_transaction_status|
 * check_status|export — at least one public identifier required
 * (mirror of PayoutShowSchema.refine).
 */
export const transactionShowQueryValidator: ValidationChain[] = [
    query("beneficiary_transaction_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("txn_ref_no")
        .optional()
        .isString()
        .isLength({ min: 1, max: 255 })
        .withMessage(localizedError("1100", 1100)),

    query("client_reference_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 255 })
        .withMessage(localizedError("1100", 1100)),

    query("beneficiary_transaction_id").custom((_value, { req }) => {
        const requestQuery = (req.query ?? {}) as Record<string, unknown>;
        return Boolean(
            requestQuery.beneficiary_transaction_id ??
                requestQuery.txn_ref_no ??
                requestQuery.client_reference_id,
        );
    }).withMessage(() => ({
        msg: "One of beneficiary_transaction_id / txn_ref_no / client_reference_id is required.",
        code: 422,
    })),
];

/**
 * GET /beneficiary-transactions/list (mirror of PayoutListQuerySchema).
 */
export const transactionListQueryValidator: ValidationChain[] = [
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

    query("search_key").optional().isString().isLength({ max: 128 }),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),

    query("type").optional().isInt({ min: 1, max: 2 }).toInt(),
];

/**
 * Keys accepted by POST /beneficiary-transactions/cancel (mirror of
 * PayoutCancelSchema.strict()).
 */
export const TRANSACTION_CANCEL_ALLOWED_KEYS = [
    "beneficiary_transaction_ids",
    "remarks",
];

export const transactionCancelBodyValidator: ValidationChain[] = [
    body("beneficiary_transaction_ids")
        .isArray({ min: 1, max: 100 })
        .withMessage(localizedError("1100", 1100)),

    body("beneficiary_transaction_ids.*")
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("remarks").optional().isString().isLength({ max: 255 }),
];

/**
 * Keys accepted by POST /beneficiary-transactions/update-status
 * (mirror of PayoutUpdateStatusSchema.strict()).
 */
export const TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS = [
    "beneficiary_transaction_ids",
    "status",
    "remarks",
];

export const transactionUpdateStatusBodyValidator: ValidationChain[] = [
    body("beneficiary_transaction_ids")
        .isArray({ min: 1, max: 100 })
        .withMessage(localizedError("1100", 1100)),

    body("beneficiary_transaction_ids.*")
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("status")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(BENEFICIARY_TRANSACTION_APPROVAL_MAP))
        .withMessage(localizedError("1100", 1100)),

    body("remarks").optional().isString().isLength({ max: 255 }),
];

/**
 * Keys accepted by POST /beneficiary-transactions/request-proof
 * (mirror of TransactionProofRequestSchema.strict()).
 */
export const PROOF_REQUEST_ALLOWED_KEYS = [
    "beneficiary_transaction_id",
    "remitter_proof",
];

export const proofRequestBodyValidator: ValidationChain[] = [
    body("beneficiary_transaction_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    body("remitter_proof")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .custom(isDocumentInput)
        .withMessage(() => ({ msg: DOCUMENT_INPUT_MESSAGE, code: 422 })),
];

/**
 * GET /beneficiary-transactions/get-proof (mirror of
 * TransactionProofGetSchema).
 */
export const proofGetQueryValidator: ValidationChain[] = [
    query("beneficiary_transaction_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];
