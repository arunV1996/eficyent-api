import { DepositTransaction } from "@prisma/client";
import { depositTransactionStatusLabel } from "../../helpers/constants";

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
  const currency = d.depositCurrency || "USD";
  return {
    unique_id: d.uniqueId,
    memo: d.memo || "",
    amount: d.amount.toFixed(2),
    fee: `${d.totalCommissionAmount.toFixed(2)} ${currency}`,
    total_amount: d.totalAmount.toFixed(2),
    currency: currency,
    type: d.type.charAt(0).toUpperCase() + d.type.slice(1),
    purpose_of_payment: d.purposeOfPayment || "",
    source_of_funds: d.sourceOfFunds || "",
    status: depositTransactionStatusLabel(d.status),
    created_at: formatDate(d.createdAt || new Date()),
    deposit_currency: currency,
  };
}

function formatDate(date: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const d = date.getDate().toString().padStart(2, "0");
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  let h = date.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12;
  const hh = h.toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  return `${d} ${m} ${y} ${hh}:${mm} ${ampm}`;
}
