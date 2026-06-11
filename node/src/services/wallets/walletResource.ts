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
  timezone?: string,
): WalletDto {
  return {
    unique_id: wallet.uniqueId,
    currency: wallet.currency,
    balance: Number(parseFloat(wallet.balance ?? "0").toFixed(2)),
    status: walletStatusLabel(wallet.status),
    created_at: wallet.createdAt ? formatDate(wallet.createdAt, timezone) : "",
    flag: wallet.flag ?? null,
  };
}

export interface WalletTransactionDto {
  unique_id: string;
  wallet: WalletDto | object;
  quote: QuoteDto | object;
  amount: string;
  fees: string;
  total_amount: string;
  status: string;
  transaction_type: number;
  created_at: string;
  virtual_account?: VirtualAccountDto | null;
  transaction_id: string;
}

export function walletTransactionResource(t: WalletTransaction, timezone?: string): WalletTransactionDto {
  const trans = t as any;
  const walletObj = trans.wallet ? walletResource(trans.wallet, timezone) : {};

  let sourceCurrency: string | undefined = undefined;
  if (trans.quote) {
    const q = trans.quote;
    if (q.virtual_accounts?.currency) {
      sourceCurrency = q.virtual_accounts.currency;
    } else if (q.sourceType === "App\\Models\\VirtualAccount") {
      sourceCurrency = "USD";
    } else if (q.wallet?.currency) {
      sourceCurrency = q.wallet.currency;
    } else if (q.sourceType === "App\\Models\\Wallet" && trans.wallet?.currency) {
      sourceCurrency = trans.wallet.currency;
    }
  }

  const quoteObj = trans.quote ? quoteResource(trans.quote, sourceCurrency, timezone) : {};

  let txId = t.transactionId || "";
  if (!txId) {
    const randPart = Math.floor(Math.random() * 900) + 100;
    const date = t.createdAt ? new Date(t.createdAt) : new Date();
    const datePart = date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0") +
      String(date.getHours()).padStart(2, "0") +
      String(date.getMinutes()).padStart(2, "0") +
      String(date.getSeconds()).padStart(2, "0");
    let fxPart = "";
    if (trans.quote) {
      fxPart = (trans.quote.fxRate || "").replace(/\./g, "");
    }
    txId = `${randPart}${datePart}${fxPart}`;
  }

  const dto: WalletTransactionDto = {
    unique_id: t.uniqueId,
    wallet: walletObj,
    quote: quoteObj,
    amount: t.amount.toString(),
    fees: t.fees.toString(),
    total_amount: t.totalAmount.toString(),
    status: walletTransactionStatusLabel(t.status),
    transaction_type: t.type,
    created_at: formatDate(t.createdAt, timezone),
    transaction_id: txId,
  };

  if (trans.quote) {
    const q = trans.quote;
    if (q.sourceType === "App\\Models\\VirtualAccount" && q.virtual_accounts) {
      dto.virtual_account = virtualAccountResource(q.virtual_accounts, undefined, "", timezone);
    }
  }

  return dto;
}
