import { DepositTransaction } from "@prisma/client";
import { depositTransactionStatusLabel } from "../../helpers/constants";
import { DEPOSIT_PURPOSE, DEPOSIT_SOURCE_OF_FUNDS, formatDate } from "../../helpers/lookups";

/**
 * Mirror of App\\Http\\Resources\\DepositTransactionResource.
 * Optimized to match the exact JSON structure expected by existing integrations.
 */

export interface DepositTransactionDto {
  unique_id: string;
  memo: string;
  amount: string;
  fee: string;
  total_amount: string;
  currency: string;
  type: string;
  purpose_of_payment: string;
  source_of_funds: string;
  status: string;
  created_at: string;
  deposit_currency: string;
}

export function depositTransactionResource(d: DepositTransaction): DepositTransactionDto {
  const currency = (d.depositCurrency || "USD").toUpperCase();
  
  // Format type to Title Case (e.g., "credit" -> "Credit")
  const typeLabel = d.type 
    ? d.type.charAt(0).toUpperCase() + d.type.slice(1).toLowerCase()
    : "Topup";

  return {
    unique_id: d.uniqueId,
    memo: d.memo || "",
    amount: d.amount.toFixed(2),
    fee: `${d.totalCommissionAmount.toFixed(2)} ${currency}`,
    total_amount: d.totalAmount.toFixed(2),
    currency: currency,
    type: typeLabel,
    purpose_of_payment: d.purposeOfPayment ? (DEPOSIT_PURPOSE[d.purposeOfPayment] ?? d.purposeOfPayment) : "",
    source_of_funds: d.sourceOfFunds ? (DEPOSIT_SOURCE_OF_FUNDS[d.sourceOfFunds] ?? d.sourceOfFunds) : "",
    status: depositTransactionStatusLabel(d.status),
    created_at: formatDate(d.createdAt || new Date()),
    deposit_currency: currency,
  };
}
