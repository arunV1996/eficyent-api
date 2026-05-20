import {
  BeneficiaryTransaction,
  BeneficiaryAccount,
  Sender,
  Quote,
} from "@prisma/client";
import { beneficiaryTransactionStatusLabel } from "../../helpers/constants";
import { formatDate } from "../../helpers/lookups";
import { beneficiaryAccountResource } from "../beneficiaryAccounts/beneficiaryResource";

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryTransactionResource.
 * Field shape updated to match the exact JSON structure expected by the legacy system.
 */

export interface BeneficiaryTransactionDto {
  unique_id: string;
  txn_ref_no: string | null;
  utr_number: string | null;
  beneficiary_account: any;
  quote: {
    unique_id: string;
    sending_amount: string;
    receiving_amount: string;
    fees: number;
    total_amount: string;
    fx_rate: string;
    quote_type: string;
    recipient_type: string;
    recipient_country: string;
    receiving_currency: string;
    payment_rail: string;
    expires_at: string;
  } | null;
  amount: string;
  commission_amount: string;
  total_amount: string;
  sending_currency: string;
  recipient_amount: string;
  receiving_currency: string;
  remarks: string;
  notes: string;
  supporting_document: string;
  status: string;
  created_by: string;
  created_at: string;
  remitter: any;
}

export function beneficiaryTransactionResource(
  txn: BeneficiaryTransaction & {
    beneficiaryAccount?: BeneficiaryAccount | null;
    senders?: Sender | null;
    quotes?: Quote | null;
    team_members?: { uniqueId: string } | null;
  },
): BeneficiaryTransactionDto {
  const statusLabel = beneficiaryTransactionStatusLabel(txn.status);

  const dto: BeneficiaryTransactionDto = {
    unique_id: txn.uniqueId,
    txn_ref_no: txn.txnRefNo,
    utr_number: txn.externalReferenceId ?? "",
    beneficiary_account: txn.beneficiaryAccount
      ? beneficiaryAccountResource(txn.beneficiaryAccount as any)
      : null,
    quote: null,
    amount: txn.amount.toFixed(2),
    commission_amount: txn.commissionAmount.toFixed(2),
    total_amount: txn.totalAmount.toFixed(2),
    sending_currency: txn.receivingCurrency ?? "USD", // Usually from wallet, fallback to receiving if null
    recipient_amount: txn.recipientAmount.toFixed(2),
    receiving_currency: txn.receivingCurrency ?? "",
    remarks: txn.remarks ?? "",
    notes: txn.notes ?? "",
    supporting_document: txn.supportingDocument ?? "",
    status: statusLabel,
    created_by: txn.team_members?.uniqueId ?? "",
    created_at: formatDate(txn.createdAt),
    remitter: null,
  };

  if (txn.quotes) {
    dto.quote = {
      unique_id: txn.quotes.uniqueId,
      sending_amount: txn.quotes.amount.toFixed(2),
      receiving_amount: txn.quotes.receivingAmount.toFixed(2),
      fees: Number(txn.quotes.commissionAmount.toFixed(2)),
      total_amount: (txn.quotes.totalSendingAmount || txn.quotes.amount).toFixed(2),
      fx_rate: txn.quotes.fxRate || `1 ${txn.receivingCurrency} = 1 ${txn.receivingCurrency}`,
      quote_type: txn.quotes.quoteType,
      recipient_type: txn.quotes.recipientType === 2 ? "BUSINESS" : "PERSONAL",
      recipient_country: txn.quotes.recipientCountry ?? "",
      receiving_currency: txn.quotes.receivingCurrency ?? "",
      payment_rail: txn.quotes.paymentRail ?? "",
      expires_at: txn.quotes.expiresAt ? formatDate(txn.quotes.expiresAt) : "",
    };
    // Ensure sending currency is actually what the quote says
    dto.sending_currency = txn.quotes.receivingCurrency ?? dto.sending_currency;
  }

  if (txn.senders) {
    const s = txn.senders;
    dto.remitter = {
      unique_id: s.uniqueId,
      type: Number(s.type) === 2 ? "BUSINESS" : "PERSONAL",
      first_name: s.firstName ?? "",
      last_name: s.lastName ?? "",
      middle_name: "",
      email: s.email ?? "",
      mobile_country_code: "",
      mobile: s.mobile ?? "",
      address: s.address1 ?? "",
      country: s.country ?? "",
      nationality: s.nationality ?? "",
      city: s.city ?? "",
      state: s.state ?? "",
      postal_code: s.postalCode ?? "",
      source_of_funds: s.sourceOfFunds ?? "",
      id_type: s.idType ?? "",
      id_number: s.idNumber ?? "",
      status: Number(s.status) === 1 ? "APPROVED" : "PENDING",
      created_at: formatDate(s.createdAt),
    };
  }

  return dto;
}

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryTransactionCallbackResource -
 * a slimmer view used by the /check_status endpoint.
 */
export function beneficiaryTransactionCallbackResource(
  txn: BeneficiaryTransaction,
): Record<string, unknown> {
  return {
    unique_id: txn.uniqueId,
    txn_ref_no: txn.txnRefNo,
    external_reference_id: txn.externalReferenceId,
    status: txn.status,
    amount: txn.amount.toString(),
    receiving_currency: txn.receivingCurrency,
    created_at: txn.createdAt ? txn.createdAt.toISOString() : "",
  };
}

/**
 * Mirror of TransactionProofResource.
 */
export interface TransactionProofDto {
  unique_id: string;
  document_type: string;
  status: number;
  remitter_proof: string | null;
  file_url: string | null;
  requested_at: string | null;
  uploaded_at: string | null;
}

export function transactionProofResource(p: {
  uniqueId: string;
  documentType: string;
  status: number;
  remitterProof: string | null;
  fileUrl: string | null;
  requestedAt: Date | null;
  uploadedAt: Date | null;
}): TransactionProofDto {
  return {
    unique_id: p.uniqueId,
    document_type: p.documentType,
    status: p.status,
    remitter_proof: p.remitterProof,
    file_url: p.fileUrl,
    requested_at: p.requestedAt ? p.requestedAt.toISOString() : null,
    uploaded_at: p.uploadedAt ? p.uploadedAt.toISOString() : null,
  };
}
