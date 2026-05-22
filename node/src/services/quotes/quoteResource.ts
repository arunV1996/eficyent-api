import { Quote } from "@prisma/client";
import { formatDate } from "../../helpers/lookups";

export interface QuoteDto {
  unique_id: string;
  sending_amount: string;
  receiving_amount: string;
  fees: number;
  total_amount: string;
  fx_rate: string;
  quote_type: string;
  recipient_type: string;
  recipient_country: string;
  receiving_currency: string;
  payment_rail: string;
  expires_at: string;
}

export function quoteResource(q: Quote, sourceCurrency?: string): QuoteDto {
  const recipientType = q.recipientType === 2 ? "BUSINESS" : "PERSONAL";
  // Use the actual source account currency if provided; fall back to receivingCurrency
  // for same-currency flows, or "USD" as last resort. Never hardcode "USD" when we
  // know the real source currency.
  const effectiveSourceCurrency = sourceCurrency ?? q.receivingCurrency ?? "USD";
  const fxRateString = q.fxRate && q.fxRate !== "1"
    ? `1 ${effectiveSourceCurrency} = ${q.fxRate} ${q.receivingCurrency}`
    : `1 ${effectiveSourceCurrency} = 1 ${effectiveSourceCurrency}`;

  return {
    unique_id: q.uniqueId,
    sending_amount: q.amount.toFixed(2),
    receiving_amount: q.receivingAmount.toFixed(2),
    fees: Number(q.commissionAmount.add(q.merchantCommissionAmount ?? 0).add(q.externalCommissionAmount ?? 0)),
    total_amount: (q.totalSendingAmount ?? q.amount).toFixed(2),
    fx_rate: fxRateString,
    quote_type: q.quoteType,
    recipient_type: recipientType,
    recipient_country: q.recipientCountry ?? "",
    receiving_currency: q.receivingCurrency ?? "",
    payment_rail: q.paymentRail ?? "",
    expires_at: formatDate(q.expiresAt),
  };
}
