import {
  BeneficiaryTransaction,
  DepositTransaction,
  Ledger,
} from "@prisma/client";
import {
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_DEPOSIT_TRANSACTION,
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
  paid_to: number | null;
  amount: string;
  balance: string;
  refund_transaction_id: string;
  created_at: string;
}

export function ledgerResource(
  l: Ledger & { transaction?: any },
): LedgerDto {
  const tx = l.transaction;

  let transId = "";
  let clientRef = "";
  let txnRef = "";
  let type = "DEBIT";
  let amount = "0.00";
  let currency = "USD";
  let paidTo: number | null = null;
  let refundId = "";

  if (l.transactionType === MORPH_DEPOSIT_TRANSACTION && tx) {
    transId = tx.uniqueId || "";
    clientRef = (tx as DepositTransaction).clientReferenceId || "";
    type = "CREDIT";
    amount = (tx as DepositTransaction).amount.toString();
    currency = (tx as DepositTransaction).depositCurrency || "USD";
  } else if (l.transactionType === MORPH_BENEFICIARY_TRANSACTION && tx) {
    transId = tx.uniqueId || "";
    clientRef = (tx as BeneficiaryTransaction).clientReferenceId || "";
    txnRef = (tx as BeneficiaryTransaction).txnRefNo || "";
    type = "DEBIT";
    amount = (tx as BeneficiaryTransaction).amount.toString();
    currency = (tx as BeneficiaryTransaction).receivingCurrency || "USD";
    // In legacy, paid_to for beneficiary transactions is often the recipient type (1=Individual, 2=Business).
    // We try to pull this from the transaction if available.
    if (tx.recipientType) {
      paidTo = Number(tx.recipientType);
    }
  }

  return {
    unique_id: l.uniqueId,
    transaction_id: transId,
    client_reference_id: clientRef,
    txn_ref_no: txnRef,
    transaction_type: type,
    paid_to: paidTo,
    amount: `${parseFloat(amount).toFixed(2)} ${currency}`,
    balance: `${parseFloat(l.balance.toString()).toFixed(2)} ${currency}`,
    refund_transaction_id: refundId,
    created_at: formatDate(l.createdAt),
  };
}
