import Quote from "../models/quote.model";
import { formatDateHuman } from "../utils/common.utils";
import { USER_TYPE_BUSINESS } from "../utils/constants";

/**
 * Mirror of the legacy quoteResource. Money columns arrive as strings
 * from the DECIMAL columns; amounts are re-emitted with two decimals
 * and fees as a number, matching the legacy Prisma.Decimal output.
 */

export interface QuoteDto {
    unique_id: string;
    sending_amount: string;
    receiving_amount: string;
    fees: number;
    total_amount: string;
    raw_fx_rate: string | null;
    fx_rate: string;
    quote_type: string;
    recipient_type: string;
    recipient_country: string;
    receiving_currency: string;
    payment_rail: string;
    expires_at: string;
}

export const quoteToJSON = (
    quote: Quote,
    sourceCurrency?: string,
    timezone?: string,
): QuoteDto => {
    const recipientType =
        quote.recipientType === USER_TYPE_BUSINESS ? "BUSINESS" : "PERSONAL";

    // Use the actual source-account currency when known; fall back to
    // the receiving currency for same-currency flows, then "USD".
    const effectiveSourceCurrency =
        sourceCurrency ?? quote.receivingCurrency ?? "USD";
    const fxRateString = quote.fxRate
        ? effectiveSourceCurrency !== quote.receivingCurrency
            ? `1 ${effectiveSourceCurrency} = ${quote.fxRate} ${quote.receivingCurrency}`
            : `1 ${effectiveSourceCurrency} = 1 ${effectiveSourceCurrency}`
        : "";

    const totalFees =
        Number(quote.commissionAmount) +
        Number(quote.merchantCommissionAmount ?? 0) +
        Number(quote.externalCommissionAmount ?? 0);

    return {
        unique_id: quote.uniqueId,
        sending_amount: Number(quote.amount).toFixed(2),
        receiving_amount: Number(quote.receivingAmount).toFixed(2),
        fees: totalFees,
        total_amount: Number(
            quote.totalSendingAmount ?? quote.amount,
        ).toFixed(2),
        fx_rate: fxRateString,
        raw_fx_rate: quote.fxRate,
        quote_type: quote.quoteType,
        recipient_type: recipientType,
        recipient_country: quote.recipientCountry ?? "",
        receiving_currency: quote.receivingCurrency ?? "",
        payment_rail: quote.paymentRail ?? "",
        expires_at: formatDateHuman(quote.expiresAt, timezone),
    };
};
