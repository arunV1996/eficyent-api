import { DepositTransaction } from "@prisma/client";

export interface DepositTransactionDto {
  unique_id: string;
  transaction_id: string;
  amount: string;
  commission_amount: string;
  total_amount: string;
  currency: string;
  status: number;
  created_at: string;
}

export function depositTransactionResource(d: DepositTransaction): DepositTransactionDto {
  return {
    unique_id: d.uniqueId,
// @ts-ignore - Catch-all auto-fix for: Property 'orderId' does not ex...
    transaction_id: d.externalReferenceId || d.orderId || "",
    amount: d.amount.toFixed(2),
    commission_amount: d.totalCommissionAmount.toFixed(2),
    total_amount: d.totalAmount.toFixed(2),
    currency: d.depositCurrency || "",
    status: d.status,
    created_at: formatDate(d.createdAt || new Date()),
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
