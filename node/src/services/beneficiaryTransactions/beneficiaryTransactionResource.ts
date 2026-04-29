import { BeneficiaryTransaction, BeneficiaryAccount, Sender, Quote } from "@prisma/client";

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryTransactionResource. Field
 * shape preserved exactly so the existing frontend / white-label consumers
 * see no change.
 */

export interface BeneficiaryTransactionDto {
  unique_id: string;
  txn_ref_no: string | null;
  client_reference_id: string | null;
  order_id: string | null;
  amount: string;
  total_amount: string;
  commission_amount: string;
  recipient_amount: string | null;
  receiving_currency: string | null;
  payment_rail: string | null;
  rail: string | null;
  external_type: string | null;
  external_reference_id: string | null;
  external_data: unknown;
  purpose_of_payment: string | null;
  supporting_document: string | null;
  remarks: string | null;
  notes: string | null;
  compliance_status: number;
  compliance_notes: string | null;
  status: number;
  created_at: string;
  beneficiary_account?: {
    unique_id: string;
    type: number | null;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    bank_name: string | null;
    account_number: string | null;
    swift_code: string | null;
    routing_number: string | null;
    currency: string;
  } | null;
  remitter?: {
    unique_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  quote?: {
    unique_id: string;
    fx_rate: string | null;
    receiving_amount: string;
    quote_type: string;
  } | null;
}

export function beneficiaryTransactionResource(
  txn: BeneficiaryTransaction & {
    beneficiaryAccount?: BeneficiaryAccount | null;
    sender?: Sender | null;
    quote?: Quote | null;
  },
): BeneficiaryTransactionDto {
  const dto: BeneficiaryTransactionDto = {
    unique_id: txn.uniqueId,
    txn_ref_no: txn.txnRefNo,
    client_reference_id: txn.clientReferenceId,
    order_id: txn.orderId,
    amount: txn.amount.toString(),
    total_amount: txn.totalAmount.toString(),
    commission_amount: txn.commissionAmount.toString(),
    recipient_amount: txn.recipientAmount ? txn.recipientAmount.toString() : null,
    receiving_currency: txn.receivingCurrency,
    payment_rail: txn.paymentRail,
    rail: txn.rail,
    external_type: txn.externalType,
    external_reference_id: txn.externalReferenceId,
    external_data: txn.externalData,
    purpose_of_payment: txn.purposeOfPayment,
    supporting_document: txn.supportingDocument,
    remarks: txn.remarks,
    notes: txn.notes,
    compliance_status: txn.complianceStatus,
    compliance_notes: txn.complianceNotes,
    status: txn.status,
    created_at: txn.createdAt.toISOString(),
  };
  if (txn.beneficiaryAccount) {
    dto.beneficiary_account = {
      unique_id: txn.beneficiaryAccount.uniqueId,
      type: txn.beneficiaryAccount.type,
      first_name: txn.beneficiaryAccount.firstName,
      last_name: txn.beneficiaryAccount.lastName,
      business_name: txn.beneficiaryAccount.businessName,
      bank_name: txn.beneficiaryAccount.bankName,
      account_number: txn.beneficiaryAccount.accountNumber,
      swift_code: txn.beneficiaryAccount.swiftCode,
      routing_number: txn.beneficiaryAccount.routingNumber,
      currency: txn.beneficiaryAccount.currency,
    };
  }
  if (txn.sender) {
    dto.remitter = {
      unique_id: txn.sender.uniqueId,
      first_name: txn.sender.firstName,
      last_name: txn.sender.lastName,
      email: txn.sender.email,
    };
  }
  if (txn.quote) {
    dto.quote = {
      unique_id: txn.quote.uniqueId,
      fx_rate: txn.quote.fxRate,
      receiving_amount: txn.quote.receivingAmount.toString(),
      quote_type: txn.quote.quoteType,
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
    created_at: txn.createdAt.toISOString(),
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
