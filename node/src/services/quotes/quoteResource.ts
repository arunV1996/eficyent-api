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

export function quoteResource(q: Quote): QuoteDto {
  const recipientType = q.recipientType === 2 ? "BUSINESS" : "PERSONAL";
  const sendingCurrency = q.fxRate ? "USD" : q.receivingCurrency ?? "USD"; // Fallback to USD
  const fxRateString = q.fxRate 
    ? `1 ${sendingCurrency} = ${q.fxRate} ${q.receivingCurrency}`
    : `1 ${sendingCurrency} = 1 ${sendingCurrency}`;

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
