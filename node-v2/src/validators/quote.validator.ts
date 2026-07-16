import { NextFunction, Request, Response } from "express";
import { check, ValidationChain } from "express-validator";
import {
    PAYMENT_RAIL_ACH,
    PAYMENT_RAIL_SWIFT,
    PAYMENT_RAIL_WIRE,
    QUOTE_TYPE_FORWARD,
    QUOTE_TYPE_REVERSE,
    USER_TYPE_MAP,
} from "../utils/constants";
import { localizedError } from "./validation_message.helper";


/**
 * express-validator chain for POST /quotes/store (body) and
 * GET /quotes/exchange-rate (query). check() reads from both
 * locations, matching the legacy controller's method-based selection.
 * Mirror of the legacy QuoteStoreSchema.
 */
export const quoteStoreValidator: ValidationChain[] = [
    check("amount")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isFloat({ min: 100, max: 99999999999 })
        .withMessage(() => ({
            msg: "amount must be between 100 and 99999999999.",
            code: 422,
        }))
        .toFloat(),

    check("recipient_type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(USER_TYPE_MAP))
        .withMessage(localizedError("1100", 1100)),

    check("recipient_country")
        .optional()
        .isString()
        .isLength({ min: 2, max: 10 })
        .withMessage(localizedError("1104", 1104)),

    check("receiving_currency")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),

    check("bank_account_id").optional().isString().isLength({ min: 1, max: 64 }),

    check("wallet_id").optional().isString().isLength({ min: 1, max: 64 }),

    check("quote_type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn([QUOTE_TYPE_FORWARD, QUOTE_TYPE_REVERSE])
        .withMessage(localizedError("1100", 1100)),

    check("payment_rail")
        .optional()
        .customSanitizer((value) =>
            typeof value === "string" ? value.toLowerCase() : value,
        )
        .isIn([PAYMENT_RAIL_ACH, PAYMENT_RAIL_SWIFT, PAYMENT_RAIL_WIRE])
        .withMessage(() => ({
            msg: "Invalid payment rail.",
            code: 422,
        })),
];

/**
 * Cross-field rules from the legacy QuoteStoreSchema refinements:
 *   - exactly one of bank_account_id / wallet_id
 *   - payment_rail required for USD/USA corridors
 * Must run after checkValidationErrors.
 */
export const quoteStoreCrossFieldRules = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const payload = (req.method === "GET" ? req.query : req.body) as Record<
        string,
        unknown
    >;

    const hasBankAccountId = Boolean(payload.bank_account_id);
    const hasWalletId = Boolean(payload.wallet_id);
    if (hasBankAccountId === hasWalletId) {
        return res.sendError(
            "Either bank_account_id or wallet_id - exactly one is required.",
            422,
            422,
        );
    }

    const receivingCurrency = String(
        payload.receiving_currency ?? "",
    ).toUpperCase();
    if (
        receivingCurrency === "USD" &&
        payload.recipient_country === "USA" &&
        !payload.payment_rail
    ) {
        return res.sendError("payment_rail required for USD/USA.", 422, 422);
    }

    next();
};

/**
 * express-validator chain for POST /lookups/refresh-rates (mirror of
 * the legacy RefreshRateBodySchema).
 */
export const refreshRatesBodyValidator: ValidationChain[] = [
    check("from_currency")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),

    check("to_currency")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),
];
