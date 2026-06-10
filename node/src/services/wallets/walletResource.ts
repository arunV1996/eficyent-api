import { Wallet, WalletTransaction } from "@prisma/client";
import { walletStatusLabel, walletTransactionStatusLabel } from "../../helpers/constants";
import { formatDate } from "../../helpers/lookups";
import { quoteResource, QuoteDto } from "../quotes/quoteResource";
import { virtualAccountResource, VirtualAccountDto } from "../virtualAccounts/virtualAccountResource";

export interface WalletDto {
  unique_id: string;
  currency: string;
  balance: number;
  status: string;
  created_at: string;
  flag: string | null;
}

export function walletResource(
  wallet: Wallet & { balance?: string; flag?: string | null },
): WalletDto {
  return {
    unique_id: wallet.uniqueId,
    currency: wallet.currency,
    balance: Number(parseFloat(wallet.balance ?? "0").toFixed(2)),
    status: walletStatusLabel(wallet.status),
    created_at: wallet.createdAt ? wallet.createdAt.toISOString() : "",
    flag: wallet.flag ?? null,
  };
}

export interface WalletTransactionDto {
  unique_id: string;
  transaction_id: string;
  wallet: WalletDto | object;
  quote: QuoteDto | object;
  amount: string;
  fees: string;
  total_amount: string;
  status: string;
  transaction_type: number;
  created_at: string;
  virtual_account?: VirtualAccountDto | null;
  balance_before?: string | null;
  balance_after?: string | null;
  beneficiary_transaction_id?: string | null;
}

export function walletTransactionResource(t: WalletTransaction): WalletTransactionDto {
  const trans = t as any;
  const walletObj = trans.wallet ? walletResource(trans.wallet) : {};
  const quoteObj = trans.quote ? quoteResource(trans.quote) : {};

  const dto: WalletTransactionDto = {
    unique_id: t.uniqueId,
    transaction_id: trans.transactionId || t.uniqueId,
    wallet: walletObj,
    quote: quoteObj,
    amount: t.amount.toString(),
    fees: t.fees.toString(),
    total_amount: t.totalAmount.toString(),
    status: walletTransactionStatusLabel(t.status),
    transaction_type: t.type,
    created_at: formatDate(t.createdAt),
    balance_before: t.balanceBefore ? t.balanceBefore.toString() : null,
    balance_after: t.balanceAfter ? t.balanceAfter.toString() : null,
    beneficiary_transaction_id: t.beneficiaryTransactionId
      ? t.beneficiaryTransactionId.toString()
      : null,
  };

  if (trans.quote) {
    const q = trans.quote;
    if (q.sourceType === "App\\Models\\VirtualAccount" && q.virtual_accounts) {
      dto.virtual_account = virtualAccountResource(q.virtual_accounts);
    }
  }

  return dto;
}
