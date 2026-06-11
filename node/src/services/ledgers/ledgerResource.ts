import {
  Ledger,
  Quote,
  Wallet,
  WalletTransaction,
} from "@prisma/client";
import {
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_DEPOSIT_TRANSACTION,
  MORPH_WALLET_TRANSACTION,
  PAID_TO_BENEFICIARY,
  PAID_TO_WALLET,
  TRANSACTION_TYPE_CREDIT,
} from "../../helpers/constants";
import { formatDate } from "../../helpers/lookups";

/**
 * Mirror of App\\Http\\Resources\\LedgerResource.
 * Expected structure matches the legacy Laravel flat format.
 */

export interface LedgerDto {
  unique_id: string;
  transaction_id: string;
  client_reference_id: string;
  txn_ref_no: string;
  transaction_type: string;
  paid_to: number | string | null;
  amount: string;
  balance: string;
  refund_transaction_id: string;
  created_at: string;
}

export interface LedgerResourceOptions {
  wallet_id?: string;
  bank_account_id?: string;
}

export function ledgerResource(
  l: Ledger & {
    transaction?: any;
    wallet?: Wallet | null;
    virtualAccount?: any | null;
    users?: { timezone?: string | null } | null;
    refundLedger?: { transaction?: any } | null;
  },
  options: LedgerResourceOptions = {},
): LedgerDto {
  const tx = l.transaction;

  const currency = l.wallet?.currency ?? l.virtualAccount?.currency ?? "";
  const fromCurrency = l.virtualAccount?.currency ?? currency;
  let displayCurrency = fromCurrency;
  if (options.wallet_id) {
    displayCurrency = currency;
  }

  let amount: any = tx?.totalAmount ?? 0;
  let balanceStr = l.balance ? `${parseFloat(l.balance.toString()).toFixed(2)} ${currency}`.trim() : "";

  let type = "DEBIT";
  if (l.transactionType === MORPH_DEPOSIT_TRANSACTION) {
    type = "CREDIT";
  } else if (l.transactionType === MORPH_WALLET_TRANSACTION && tx) {
    type = tx.type === TRANSACTION_TYPE_CREDIT ? "CREDIT" : "DEBIT";
  }

  let paidTo: number | string | null = "";

  if (l.transactionType === MORPH_BENEFICIARY_TRANSACTION && tx) {
    paidTo = PAID_TO_BENEFICIARY;
  }

  if (l.transactionType === MORPH_WALLET_TRANSACTION && tx) {
    const wt = tx as WalletTransaction & { quote?: Quote; wallet?: Wallet };

    if (options.bank_account_id) {
      amount = wt.quote?.totalSendingAmount ?? amount;
    }

    if (options.wallet_id) {
      balanceStr = wt.balanceAfter
        ? `${parseFloat(wt.balanceAfter.toString()).toFixed(2)} ${currency}`.trim()
        : "";
    }

    if (options.bank_account_id) {
      balanceStr = l.balance ? `${parseFloat(l.balance.toString()).toFixed(2)} ${fromCurrency}`.trim() : "";
    }

    if (l.virtualAccountId && l.walletId && !options.wallet_id) {
      type = "DEBIT";
    }

    paidTo = PAID_TO_WALLET;
  }

  // Refund transaction resolving
  let refundId = "";
  if (l.refundLedgerId) {
    const refundTx = (l as any).refundLedger?.transaction;
    refundId = refundTx?.clientReferenceId || refundTx?.client_reference_id || "";
  }

  // Client reference ID logic:
  let clientRef = "";
  if (tx) {
    clientRef = tx.clientReferenceId || tx.client_reference_id || "";
  }
  if (!clientRef) {
    clientRef = refundId;
  }

  // txn_ref_no
  let txnRef = "";
  if (tx) {
    txnRef = tx.txnRefNo || tx.txn_ref_no || "";
  }

  const timezone = l.users?.timezone || "Asia/Kolkata";

  return {
    unique_id: l.uniqueId,
    transaction_id: tx?.uniqueId || "",
    client_reference_id: clientRef,
    txn_ref_no: txnRef,
    transaction_type: type,
    paid_to: type === "DEBIT" ? paidTo : "",
    amount: amount ? `${parseFloat(amount.toString()).toFixed(2)} ${displayCurrency}`.trim() : "",
    balance: balanceStr,
    refund_transaction_id: refundId,
    created_at: formatDate(tx?.createdAt || l.createdAt, timezone),
  };
}
