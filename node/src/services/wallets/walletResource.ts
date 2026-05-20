import { Wallet, WalletTransaction } from "@prisma/client";
import { walletTransactionStatusLabel } from "../../helpers/constants";

export interface WalletDto {
  unique_id: string;
  currency: string;
  balance: string;
  status: number;
  created_at: string;
}

export function walletResource(
  wallet: Wallet & { balance?: string },
): WalletDto {
  return {
    unique_id: wallet.uniqueId,
    currency: wallet.currency,
    balance: wallet.balance ?? "0",
    status: wallet.status,
    created_at: wallet.createdAt ? wallet.createdAt.toISOString() : "",
  };
}

export interface WalletTransactionDto {
  unique_id: string;
  amount: string;
  fees: string;
  total_amount: string;
  type: number;
  status: string;
  balance_before: string | null;
  balance_after: string | null;
  quote_id: string | null;
  beneficiary_transaction_id: string | null;
  created_at: string;
}

export function walletTransactionResource(t: WalletTransaction): WalletTransactionDto {
  return {
    unique_id: t.uniqueId,
    amount: t.amount.toString(),
    fees: t.fees.toString(),
    total_amount: t.totalAmount.toString(),
    type: t.type,
    status: walletTransactionStatusLabel(t.status),
    balance_before: t.balanceBefore ? t.balanceBefore.toString() : null,
    balance_after: t.balanceAfter ? t.balanceAfter.toString() : null,
    quote_id: t.quoteId ? t.quoteId.toString() : null,
    beneficiary_transaction_id: t.beneficiaryTransactionId
      ? t.beneficiaryTransactionId.toString()
      : null,
    created_at: t.createdAt ? t.createdAt.toISOString() : "",
  };
}
