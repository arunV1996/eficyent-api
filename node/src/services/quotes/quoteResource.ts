import { Quote } from "@prisma/client";

export interface QuoteDto {
  unique_id: string;
  amount: string;
  total_sending_amount: string | null;
  receiving_amount: string;
  commission_amount: string;
  external_commission_amount: string;
  merchant_commission_amount: string;
  fx_rate: string | null;
  external_fx_rate: string | null;
  internal_fx_rate: string | null;
  quote_type: string;
  recipient_type: number;
  recipient_country: string | null;
  receiving_currency: string | null;
  payment_rail: string | null;
  status: number;
  external_type: string;
  external_reference_id: string | null;
  expires_at: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

export function quoteResource(q: Quote): QuoteDto {
  return {
    unique_id: q.uniqueId,
    amount: q.amount.toString(),
    total_sending_amount: q.totalSendingAmount ? q.totalSendingAmount.toString() : null,
    receiving_amount: q.receivingAmount.toString(),
    commission_amount: q.commissionAmount.toString(),
    external_commission_amount: q.externalCommissionAmount.toString(),
    merchant_commission_amount: q.merchantCommissionAmount.toString(),
    fx_rate: q.fxRate,
    external_fx_rate: q.externalFxRate,
    internal_fx_rate: q.internalFxRate,
    quote_type: q.quoteType,
    recipient_type: q.recipientType,
    recipient_country: q.recipientCountry,
    receiving_currency: q.receivingCurrency,
    payment_rail: q.paymentRail,
    status: q.status,
    external_type: q.externalType,
    external_reference_id: q.externalReferenceId,
    expires_at: q.expiresAt ? q.expiresAt.toISOString() : null,
    source_type: q.sourceType,
    source_id: q.sourceId ? q.sourceId.toString() : null,
    created_at: q.createdAt.toISOString(),
  };
}
