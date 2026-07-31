import { NextFunction, Request, Response } from "express";
import { check, ValidationChain } from "express-validator";
import { getPaymentRails } from "../helpers/lookup.helper";
import {
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

    // Rails are corridor-specific now — lowercase here, validate
    // against getPaymentRails(recipient_country) in the cross-field
    // rules below.
    check("payment_rail")
        .optional()
        .customSanitizer((value) =>
            typeof value === "string" ? value.toLowerCase() : value,
        ),
];

/**
 * Cross-field rules from the legacy QuoteStoreSchema refinements:
 *   - exactly one of bank_account_id / wallet_id
 *   - payment_rail required for USD/USA and BGD corridors
 *   - payment_rail must belong to getPaymentRails(recipient_country)
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
    const recipientCountry = payload.recipient_country
        ? String(payload.recipient_country)
        : "";
    const paymentRail = payload.payment_rail
        ? String(payload.payment_rail)
        : "";

    if (
        receivingCurrency === "USD" &&
        recipientCountry === "USA" &&
        !paymentRail
    ) {
        return res.sendError("payment_rail required for USD/USA.", 422, 422);
    }

    if (recipientCountry === "BGD" && !paymentRail) {
        return res.sendError("payment_rail required for BGD.", 422, 422);
    }

    // Dynamic rail membership: whatever corridor was requested, the
    // rail must be one the country actually supports (countries with
    // no rails accept any/no value).
    if (paymentRail && recipientCountry) {
        const allowed = getPaymentRails(recipientCountry).map((rail) =>
            rail.value.toLowerCase(),
        );
        if (
            allowed.length > 0 &&
            !allowed.includes(paymentRail.toLowerCase())
        ) {
            return res.sendError(
                `Invalid payment rail. Expected one of: ${allowed.join(", ")}`,
                422,
                422,
            );
        }
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
