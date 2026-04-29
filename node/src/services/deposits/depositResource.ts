import { DepositTransaction } from "@prisma/client";

export interface DepositTransactionDto {
  unique_id: string;
  amount: string;
  commission_amount: string;
  external_commission_amount: string;
  merchant_commission_amount: string;
  total_commission_amount: string;
  total_amount: string;
  deposit_currency: string | null;
  from_wallet_address: string | null;
  transaction_hash: string | null;
  memo: string | null;
  external_type: string | null;
  external_reference_id: string | null;
  external_status: string | null;
  client_reference_id: string | null;
  status: number;
  type: string;
  purpose_of_payment: string | null;
  source_of_funds: string | null;
  proof: string | null;
  order_id: string | null;
  remarks: string | null;
  external_remarks: string | null;
  created_at: string;
}

export function depositTransactionResource(d: DepositTransaction): DepositTransactionDto {
  return {
    unique_id: d.uniqueId,
    amount: d.amount.toString(),
    commission_amount: d.commissionAmount.toString(),
    external_commission_amount: d.externalCommissionAmount.toString(),
    merchant_commission_amount: d.merchantCommissionAmount.toString(),
    total_commission_amount: d.totalCommissionAmount.toString(),
    total_amount: d.totalAmount.toString(),
    deposit_currency: d.depositCurrency,
    from_wallet_address: d.fromWalletAddress,
    transaction_hash: d.transactionHash,
    memo: d.memo,
    external_type: d.externalType,
    external_reference_id: d.externalReferenceId,
    external_status: d.externalStatus,
    client_reference_id: d.clientReferenceId,
    status: d.status,
    type: d.type,
    purpose_of_payment: d.purposeOfPayment,
    source_of_funds: d.sourceOfFunds,
    proof: d.proof,
    order_id: d.orderId,
    remarks: d.remarks,
    external_remarks: d.externalRemarks,
    created_at: d.createdAt.toISOString(),
  };
}
