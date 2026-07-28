import { Request, Response } from "express";
import { applyAedOverrideToQuote } from "../helpers/aed_override.helper";
import { CodedError } from "../helpers/coded_error.helper";
import {
    calcFxCommissions,
    calcTransactionCommissions,
    getFixedRate,
} from "../helpers/commission.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import Merchant from "../models/merchant.model";
import Quote from "../models/quote.model";
import SupportedCountry from "../models/supported_country.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import { quoteToJSON } from "../resources/quote.resource";
import {
    createQuote as massiveCreateQuote,
    QuoteDriverResponse,
} from "../services/massive.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    BUSINESS_MODEL_DEAL_BASED,
    EXTERNAL_TYPE_MASSIVE,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    QUOTE_MODE_QUOTATION,
    QUOTE_MODE_RATE,
    QUOTE_TYPE_REVERSE,
    USER_TYPE_MAP,
    WALLET_STATUS_ACTIVE,
} from "../utils/constants";

/**
 * Mirror of Api\QuotesController + QuoteRepository::store.
 *
 *   - source resolution (VirtualAccount or Wallet) via the validator's
 *     mutually exclusive bank_account_id / wallet_id
 *   - same-currency path: fx_rate = 1, no external call, transaction
 *     commissions only
 *   - cross-currency path: fixed-rate short-circuit, Massive driver,
 *     provider-failure fixed-rate fallback, AED override, fx +
 *     transaction commissions
 *   - mode=rate (GET /exchange-rate) skips the transaction-commission
 *     line
 */

type QuoteMode = typeof QUOTE_MODE_RATE | typeof QUOTE_MODE_QUOTATION;

interface QuotePayload {
    amount: number;
    recipient_type: string;
    recipient_country?: string;
    receiving_currency: string;
    bank_account_id?: string;
    wallet_id?: string;
    quote_type: string;
    payment_rail?: string | null;
}

interface ResolvedSource {
    kind: "virtual_account" | "wallet";
    id: number;
    currency: string;
    status: number;
}

const resolveSource = async (
    payload: QuotePayload,
    user: User,
): Promise<ResolvedSource> => {
    if (payload.bank_account_id) {
        const baseScope = await getVirtualAccountScope(user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: payload.bank_account_id,
            },
        });
        if (!virtualAccount) {
            throw new CodedError("Bank account not found.", 120, 400);
        }
        return {
            kind: "virtual_account",
            id: virtualAccount.id,
            currency: virtualAccount.currency,
            status: virtualAccount.status,
        };
    }
    if (payload.wallet_id) {
        const wallet = await Wallet.findOne({
            where: { uniqueId: payload.wallet_id, userId: user.id },
        });
        if (!wallet) {
            throw new CodedError("Bank account not found.", 120, 400);
        }
        return {
            kind: "wallet",
            id: wallet.id,
            currency: wallet.currency,
            status: wallet.status,
        };
    }
    throw new CodedError("Bank account not found.", 120, 400);
};

const buildResponse = async (
    payload: QuotePayload,
    source: ResolvedSource,
    userId: number,
    merchantId: number | null,
    merchantType: number | null,
    quoteMode: QuoteMode,
    recipientTypeNumeric: number,
): Promise<Record<string, unknown>> => {
    const receivingCurrency = payload.receiving_currency.toUpperCase();
    const isCrossBorderUsd =
        payload.recipient_country !== "USA" && receivingCurrency === "USD";
    const paymentRail = isCrossBorderUsd
        ? "swift"
        : payload.payment_rail ?? null;

    if (source.kind === "wallet") {
        if (source.currency !== receivingCurrency) {
            throw new CodedError(
                "Wallet currency does not match the receiving currency.",
                172,
                400,
            );
        }
        if (source.status !== WALLET_STATUS_ACTIVE) {
            throw new CodedError("Wallet is not active.", 169, 400);
        }
        const transactionCommission = await calcTransactionCommissions(
            {
                amount: payload.amount,
                receivingCurrency,
                sourceCurrency: source.currency,
                paymentRail,
                sourceType: "wallet",
            },
            { userId, merchantId, merchantType },
        );
        return {
            amount: payload.amount,
            total_sending_amount:
                payload.amount +
                transactionCommission.commission_amount +
                transactionCommission.merchant_commission_amount,
            fx_rate: "1",
            external_fx_rate: "1",
            internal_fx_rate: "1",
            receiving_amount: payload.amount,
            recipient_country: payload.recipient_country!,
            receiving_currency: receivingCurrency,
            recipient_type: recipientTypeNumeric,
            quote_type: payload.quote_type,
            payment_rail: paymentRail,
            source_type: MORPH_WALLET,
            source_id: source.id,
            external_type: EXTERNAL_TYPE_MASSIVE,
            commission_amount: transactionCommission.commission_amount,
            merchant_commission_amount:
                transactionCommission.merchant_commission_amount,
            external_commission_amount: 0,
        };
    }

    // VirtualAccount source — same-currency path.
    if (source.currency === receivingCurrency) {
        const transactionCommission = await calcTransactionCommissions(
            {
                amount: payload.amount,
                receivingCurrency,
                sourceCurrency: source.currency,
                paymentRail,
                sourceType: "virtual_account",
            },
            { userId, merchantId, merchantType },
        );
        return {
            amount: payload.amount,
            total_sending_amount:
                payload.amount +
                transactionCommission.commission_amount +
                transactionCommission.merchant_commission_amount,
            fx_rate: "1",
            external_fx_rate: "1",
            internal_fx_rate: "1",
            receiving_amount: payload.amount,
            recipient_country: payload.recipient_country!,
            receiving_currency: receivingCurrency,
            recipient_type: recipientTypeNumeric,
            quote_type: payload.quote_type,
            payment_rail: paymentRail,
            source_type: MORPH_VIRTUAL_ACCOUNT,
            source_id: source.id,
            external_type: EXTERNAL_TYPE_MASSIVE,
            commission_amount: transactionCommission.commission_amount,
            merchant_commission_amount:
                transactionCommission.merchant_commission_amount,
            external_commission_amount: 0,
        };
    }

    // Cross-currency. Fixed FX fee override short-circuits the
    // provider call; provider failures also fall back to it.
    let driverResponse: QuoteDriverResponse;
    const fixedRate = await getFixedRate(
        userId,
        merchantId,
        source.currency,
        receivingCurrency,
    );

    const fixedRateResponse = (rate: number): QuoteDriverResponse => {
        const sendingAmount =
            payload.quote_type === QUOTE_TYPE_REVERSE
                ? payload.amount / rate
                : payload.amount;
        const receivingAmount =
            payload.quote_type === QUOTE_TYPE_REVERSE
                ? payload.amount
                : payload.amount * rate;
        return {
            amount: sendingAmount,
            receiving_amount: receivingAmount,
            fx_rate: rate,
            external_fx_rate: rate,
            quote_type: payload.quote_type,
        };
    };

    if (fixedRate !== null) {
        driverResponse = fixedRateResponse(fixedRate);
    } else {
        try {
            const rawDriverResponse = await massiveCreateQuote(
                {
                    amount: payload.amount,
                    from_currency: source.currency,
                    receiving_currency: receivingCurrency,
                    recipient_country: payload.recipient_country!,
                    recipient_type: recipientTypeNumeric,
                    quote_type: payload.quote_type,
                    payment_rail: paymentRail,
                },
                { id: userId },
            );
            driverResponse = applyAedOverrideToQuote(
                rawDriverResponse,
                source.currency,
            );
        } catch {
            const fallbackRate = await getFixedRate(
                userId,
                merchantId,
                source.currency,
                receivingCurrency,
            );
            if (fallbackRate !== null) {
                driverResponse = fixedRateResponse(fallbackRate);
            } else {
                throw new CodedError(
                    "FX rate not available from quote provider.",
                    189,
                    422,
                );
            }
        }
    }

    const fxResult = await calcFxCommissions(
        {
            amount: driverResponse.amount,
            receivingAmount: driverResponse.receiving_amount,
            fxRate: driverResponse.fx_rate,
            quoteType: driverResponse.quote_type,
            receivingCurrency,
            sourceCurrency: source.currency,
            sourceId: source.id,
            paymentRail,
        },
        { userId, merchantId, merchantType },
    );

    let totalSending = fxResult.amount;
    let transactionCommission = {
        commission_amount: 0,
        merchant_commission_amount: 0,
    };
    let externalCommission = 0;

    if (quoteMode === QUOTE_MODE_QUOTATION) {
        transactionCommission = await calcTransactionCommissions(
            {
                amount: fxResult.amount,
                receivingCurrency,
                sourceCurrency: source.currency,
                paymentRail,
                sourceType: "virtual_account",
            },
            { userId, merchantId, merchantType },
        );
        externalCommission = driverResponse.external_commission_amount ?? 0;
        totalSending =
            fxResult.amount +
            externalCommission +
            transactionCommission.commission_amount +
            transactionCommission.merchant_commission_amount;
    }

    return {
        amount: fxResult.amount,
        total_sending_amount: totalSending,
        fx_rate: String(fxResult.fx_rate),
        external_fx_rate: String(driverResponse.fx_rate),
        internal_fx_rate: String(fxResult.internal_fx_rate),
        receiving_amount: fxResult.receiving_amount,
        commission_value: fxResult.commission_value,
        commission_amount: transactionCommission.commission_amount,
        merchant_commission_amount:
            transactionCommission.merchant_commission_amount,
        external_commission_amount: externalCommission,
        recipient_country: payload.recipient_country!,
        receiving_currency: receivingCurrency,
        recipient_type: recipientTypeNumeric,
        quote_type: payload.quote_type,
        payment_rail: paymentRail,
        source_type: MORPH_VIRTUAL_ACCOUNT,
        source_id: source.id,
        virtual_account_id: source.id,
        external_type: EXTERNAL_TYPE_MASSIVE,
        external_reference_id: driverResponse.external_reference_id,
        external_data: driverResponse.external_data,
        expires_at: driverResponse.expires_at,
    };
};

const persistQuote = async (
    userId: number,
    response: Record<string, unknown>,
): Promise<Quote> => {
    return Quote.create({
        uniqueId: generateUniqueId(24),
        userId,
        amount: String(response.amount ?? 0),
        totalSendingAmount: String(response.total_sending_amount ?? 0),
        receivingAmount: String(response.receiving_amount ?? 0),
        commissionAmount: String(response.commission_amount ?? 0),
        merchantCommissionAmount: String(
            response.merchant_commission_amount ?? 0,
        ),
        externalCommissionAmount: String(
            response.external_commission_amount ?? 0,
        ),
        commissionValue: String(response.commission_value ?? 0),
        fxRate: response.fx_rate ? String(response.fx_rate) : null,
        externalFxRate: response.external_fx_rate
            ? String(response.external_fx_rate)
            : null,
        internalFxRate: response.internal_fx_rate
            ? String(response.internal_fx_rate)
            : null,
        quoteType: String(response.quote_type),
        recipientType: Number(response.recipient_type),
        recipientCountry: response.recipient_country
            ? String(response.recipient_country)
            : null,
        receivingCurrency: response.receiving_currency
            ? String(response.receiving_currency)
            : null,
        paymentRail: response.payment_rail
            ? String(response.payment_rail)
            : null,
        sourceType: response.source_type ? String(response.source_type) : null,
        sourceId: (response.source_id as number | undefined) ?? null,
        virtualAccountId:
            (response.virtual_account_id as number | undefined) ?? null,
        externalType: String(response.external_type ?? "ec"),
        externalReferenceId: response.external_reference_id
            ? String(response.external_reference_id)
            : null,
        externalData: response.external_data ?? null,
        expiresAt: response.expires_at
            ? new Date(String(response.expires_at))
            : new Date(Date.now() + 30 * 60 * 1000),
    });
};

/**
 * Shared handler for POST /quotes/store (quotation mode) and
 * GET /quotes/exchange-rate (rate mode).
 */
export const makeQuoteStore = (quoteMode: QuoteMode) => {
    return async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                return res.sendError(res.__("102"), 102, 400);
            }

            const payload = (
                req.method === "GET" ? req.query : req.body
            ) as unknown as QuotePayload;
            payload.amount = Number(payload.amount);

            const merchant = req.user.merchantId
                ? await Merchant.findByPk(req.user.merchantId)
                : null;
            const merchantId = merchant?.id ?? null;
            const merchantType = merchant?.type ?? null;

            if (!payload.recipient_country) {
                const supportedCountry = await SupportedCountry.findOne({
                    where: { currency: payload.receiving_currency },
                });
                if (supportedCountry) {
                    payload.recipient_country = supportedCountry.countryCode;
                }
            }

            const recipientTypeNumeric =
                USER_TYPE_MAP[payload.recipient_type] ?? 1;

            // Deal-based wallet override: the business model now lives
            // on the wallet row itself — a deal_based wallet in the
            // receiving currency forces the quote onto that wallet
            // (same-currency transfer).
            if (quoteMode === QUOTE_MODE_QUOTATION) {
                const wallet = await Wallet.findOne({
                    where: {
                        userId: req.user.id,
                        currency: payload.receiving_currency.toUpperCase(),
                    },
                });
                if (
                    wallet &&
                    wallet.businessModel === BUSINESS_MODEL_DEAL_BASED
                ) {
                    payload.bank_account_id = undefined;
                    payload.wallet_id = wallet.uniqueId;
                }
            }

            const source = await resolveSource(payload, req.user);
            const response = await buildResponse(
                payload,
                source,
                req.user.id,
                merchantId,
                merchantType,
                quoteMode,
                recipientTypeNumeric,
            );
            const quote = await persistQuote(req.user.id, response);

            return res.sendResponse(
                { quote: quoteToJSON(quote, source.currency) },
                res.__("success.107"),
                107,
            );
        } catch (error) {
            if (error instanceof CodedError) {
                return res.sendError(
                    error.message,
                    error.errorCode,
                    error.httpStatus,
                );
            }
            return res.handleError(error);
        }
    };
};
