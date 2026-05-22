import {
  BeneficiaryTransaction,
  DepositTransaction,
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
  },
  options: LedgerResourceOptions = {},
): LedgerDto {
  const tx = l.transaction;

  let transId = "";
  let clientRef = "";
  let txnRef = "";
  let type = "DEBIT";
  let amount = "0.00";
  let currency = l.wallet?.currency ?? l.virtualAccount?.currency ?? "";
  let fromCurrency = l.virtualAccount?.currency ?? currency;
  let paidTo: number | string | null = "";
  let balanceStr = "";
  let refundId = "";

  // 1. Determine base type and basic info
  if (l.transactionType === MORPH_DEPOSIT_TRANSACTION && tx) {
    const dt = tx as DepositTransaction;
    transId = dt.uniqueId || "";
    clientRef = dt.clientReferenceId || "";
    type = "CREDIT";
    amount = dt.totalAmount.toString();
    currency = dt.depositCurrency || currency;
    fromCurrency = dt.depositCurrency || fromCurrency;
  } else if (l.transactionType === MORPH_BENEFICIARY_TRANSACTION && tx) {
    const bt = tx as BeneficiaryTransaction;
    transId = bt.uniqueId || "";
    clientRef = bt.clientReferenceId || "";
    txnRef = bt.txnRefNo || "";
    type = "DEBIT";
    amount = bt.totalAmount.toString();
    currency = bt.receivingCurrency || currency;
    paidTo = PAID_TO_BENEFICIARY;
  } else if (l.transactionType === MORPH_WALLET_TRANSACTION && tx) {
    const wt = tx as WalletTransaction & { quote?: Quote; wallet?: Wallet };
    // match legacy: transaction_id in ledger is actually the unique_id
    transId = wt.uniqueId;
    clientRef = wt.quote?.uniqueId || "";
    type = wt.type === TRANSACTION_TYPE_CREDIT ? "CREDIT" : "DEBIT";
    amount = wt.totalAmount.toString();

    // Context-sensitive Laravel logic
    if (options.wallet_id || options.bank_account_id) {
      if (wt.quote?.totalSendingAmount) {
        amount = wt.quote.totalSendingAmount.toString();
      }
    }
    if (options.wallet_id) {
      amount = wt.totalAmount.toString();
      fromCurrency = wt.wallet?.currency || "";
      balanceStr = (wt as any).balanceAfter
        ? `${parseFloat((wt as any).balanceAfter.toString()).toFixed(2)} ${currency}`
        : "";
    }
    if (options.bank_account_id) {
      balanceStr = l.balance ? `${parseFloat(l.balance.toString()).toFixed(2)} ${fromCurrency}` : "";
    }

    // Morph debit check
    if (l.virtualAccountId && l.walletId && !options.wallet_id) {
      type = "DEBIT";
    }
    paidTo = PAID_TO_WALLET;
  }

  // 2. Resolve final balance string
  balanceStr = l.balance ? `${parseFloat(l.balance.toString()).toFixed(2)} ${currency}` : "";
  return {
    unique_id: l.uniqueId,
    transaction_id: transId,
    client_reference_id: clientRef,
    txn_ref_no: txnRef,
    transaction_type: type, // already mapped to label in Node pattern
    paid_to: type === "DEBIT" ? paidTo : "",
    amount: amount ? `${parseFloat(amount).toFixed(2)} ${fromCurrency}`.trim() : "",
    balance: balanceStr,
    refund_transaction_id: refundId,
    created_at: formatDate(l.createdAt),
  };
}
