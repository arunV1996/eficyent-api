import { BeneficiaryTransaction } from "@prisma/client";
import {
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_CANCELLED,
  BENEFICIARY_TRANSACTION_COMPLETED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
  BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
  BENEFICIARY_TRANSACTION_EXPIRED,
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  BENEFICIARY_TRANSACTION_REJECTED,
  BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  depositTransactionStatusLabel,
} from "../../helpers/constants";

/**
 * Mirror of App\\Helpers\\Enums::beneficiary_transaction_status_label.
 *
 * Collapses internal status integers to the public label sent to merchant
 * callback endpoints. Anything in PU/COMPLIANCE/etc collapses to
 * "PROCESSING" so merchants don't see internal pipeline states.
 */
export function beneficiaryTransactionStatusLabel(value: number): string | null {
  switch (value) {
    case BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL:
      return "WAITING_FOR_APPROVAL";
    case BENEFICIARY_TRANSACTION_APPROVED:
    case BENEFICIARY_TRANSACTION_INITIATED:
    case BENEFICIARY_TRANSACTION_PROCESSING:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD:
    case BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED:
    case BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING:
    case BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED:
      return "PROCESSING";
    case BENEFICIARY_TRANSACTION_COMPLETED:
      return "COMPLETED";
    case BENEFICIARY_TRANSACTION_FAILED:
      return "FAILED";
    case BENEFICIARY_TRANSACTION_CANCELLED:
      return "CANCELLED";
    case BENEFICIARY_TRANSACTION_EXPIRED:
      return "EXPIRED";
    case BENEFICIARY_TRANSACTION_REJECTED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED:
      return "REJECTED";
    case BENEFICIARY_TRANSACTION_CORPORATE_INITIATED:
      return "CORPORATE_INITIATED";
    default:
      return null;
  }
}

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryTransactionCallbackResource.
 * Shape preserved exactly for downstream merchants.
 */
export function beneficiaryTransactionCallbackPayload(
  txn: BeneficiaryTransaction,
): {
  unique_id: string;
  txn_ref_no: string;
  client_reference_id: string;
  utr_number: string;
  total_amount: string;
  status: string;
  remarks: string;
} {
  return {
    unique_id: txn.uniqueId ?? "",
    txn_ref_no: txn.txnRefNo ?? "",
    client_reference_id: txn.clientReferenceId ?? "",
    utr_number: txn.externalReferenceId ?? "",
    total_amount: txn.totalAmount?.toString() ?? "",
    status: beneficiaryTransactionStatusLabel(txn.status) ?? "",
    remarks: txn.notes ?? "",
  };
}

export function depositTransactionCallbackPayload(
  txn: any,
): {
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
} {
  const currency = (txn.depositCurrency || "USD").toUpperCase();
  const typeLabel = txn.type
    ? txn.type.charAt(0).toUpperCase() + txn.type.slice(1).toLowerCase()
    : "Topup";
  return {
    unique_id: txn.uniqueId,
    memo: txn.memo || "",
    amount: typeof txn.amount === "number" ? txn.amount.toFixed(2) : Number(txn.amount || 0).toFixed(2),
    fee: `${typeof txn.totalCommissionAmount === "number" ? txn.totalCommissionAmount.toFixed(2) : Number(txn.totalCommissionAmount || 0).toFixed(2)} ${currency}`,
    total_amount: typeof txn.totalAmount === "number" ? txn.totalAmount.toFixed(2) : Number(txn.totalAmount || 0).toFixed(2),
    currency: currency,
    type: typeLabel,
    purpose_of_payment: txn.purposeOfPayment || "",
    source_of_funds: txn.sourceOfFunds || "",
    status: depositTransactionStatusLabel(txn.status),
    created_at: txn.createdAt instanceof Date ? txn.createdAt.toISOString() : new Date(txn.createdAt || "").toISOString(),
  };
}
