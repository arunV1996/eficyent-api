import { Ledger } from "@prisma/client";

export interface LedgerDto {
  unique_id: string;
  virtual_account_id: string | null;
  wallet_id: string | null;
  transaction_type: string | null;
  transaction_id: string | null;
  balance: string;
  external_type: string | null;
  description: string | null;
  refund_ledger_id: string | null;
  created_at: string;
  transaction?: unknown;
}

export function ledgerResource(
  l: Ledger & { transaction?: unknown },
): LedgerDto {
  return {
    unique_id: l.uniqueId,
    virtual_account_id: l.virtualAccountId ? l.virtualAccountId.toString() : null,
    wallet_id: l.walletId ? l.walletId.toString() : null,
    transaction_type: l.transactionType,
    transaction_id: l.transactionId ? l.transactionId.toString() : null,
    balance: l.balance.toString(),
    external_type: l.externalType,
    description: l.description,
    refund_ledger_id: l.refundLedgerId ? l.refundLedgerId.toString() : null,
    created_at: l.createdAt.toISOString(),
    transaction: l.transaction,
  };
}
