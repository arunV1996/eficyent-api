import { DepositTransaction, VirtualAccount, AdminWallet } from "@prisma/client";
import { depositTransactionStatusLabel } from "../../helpers/constants";
import { DEPOSIT_PURPOSE, DEPOSIT_SOURCE_OF_FUNDS, formatDate } from "../../helpers/lookups";
import { prisma } from "../../db/prisma";
import { s3Service } from "../storage/s3Service";

/**
 * Mirror of App\\Http\\Resources\\DepositTransactionResource.
 * Optimized to match the exact JSON structure expected by existing integrations.
 */

export interface DepositTransactionDto {
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
  deposit_currency: string;
  proof?: string;
  client_reference_id?: string;
  refund_transaction?: {
    unique_id: string;
    txn_ref_no: string;
  };
  remarks?: string;
  from_wallet_address?: string;
  to_wallet?: string;
  transaction_hash?: string;
}

export async function depositTransactionResource(
  d: DepositTransaction & {
    virtualAccount?: VirtualAccount | null;
    admin_wallets?: AdminWallet | null;
  },
): Promise<DepositTransactionDto> {
  // Resolve virtual account currency
  let vaCurrency = "USD";
  if (d.virtualAccount) {
    vaCurrency = d.virtualAccount.currency;
  } else if (d.virtualAccountId) {
    try {
      const va = await prisma().virtualAccount.findUnique({
        where: { id: d.virtualAccountId },
        select: { currency: true },
      });
      if (va?.currency) {
        vaCurrency = va.currency;
      }
    } catch {}
  }
  const currency = (d.depositCurrency || vaCurrency).toUpperCase();
  
  // Format type to Title Case (e.g., "credit" -> "Credit")
  const typeLabel = d.type 
    ? d.type.charAt(0).toUpperCase() + d.type.slice(1).toLowerCase()
    : "Topup";

  const res: DepositTransactionDto = {
    unique_id: d.uniqueId,
    memo: d.memo || "",
    amount: d.amount.toFixed(2),
    fee: `${d.totalCommissionAmount.toFixed(2)} ${currency}`,
    total_amount: d.totalAmount.toFixed(2),
    currency: currency,
    type: typeLabel,
    purpose_of_payment: d.purposeOfPayment ? (DEPOSIT_PURPOSE[d.purposeOfPayment] ?? d.purposeOfPayment) : "",
    source_of_funds: d.sourceOfFunds ? (DEPOSIT_SOURCE_OF_FUNDS[d.sourceOfFunds] ?? d.sourceOfFunds) : "",
    status: depositTransactionStatusLabel(d.status),
    created_at: formatDate(d.createdAt || new Date()),
    deposit_currency: d.depositCurrency || currency,
  };

  // Proof URL
  if (d.proof) {
    try {
      res.proof = await s3Service.temporaryUrl(d.proof);
    } catch {
      res.proof = "";
    }
  }

  // Client reference ID
  if (d.clientReferenceId) {
    res.client_reference_id = d.clientReferenceId;
  }

  // Remarks
  if (d.remarks) {
    res.remarks = d.remarks;
  }

  // From wallet address
  if (d.fromWalletAddress) {
    res.from_wallet_address = d.fromWalletAddress;
  }

  // To wallet
  let toWallet = "";
  if (d.admin_wallets) {
    toWallet = d.admin_wallets.wallet_address || "";
  } else if (d.adminWalletId) {
    try {
      const aw = await prisma().adminWallet.findUnique({
        where: { id: d.adminWalletId },
        select: { wallet_address: true },
      });
      if (aw?.wallet_address) {
        toWallet = aw.wallet_address;
      }
    } catch {}
  }
  if (toWallet) {
    res.to_wallet = toWallet;
  }

  // Transaction Hash
  if (d.transactionHash) {
    res.transaction_hash = d.transactionHash;
  }

  // Refund Transaction from Ledger
  try {
    const ledger = await prisma().ledger.findFirst({
      where: {
        transactionType: "App\\Models\\DepositTransaction",
        transactionId: d.id,
      },
      include: {
        ledgers: true, // points to refund ledger row
      },
    });

    if (ledger?.ledgers) {
      const refundLedger = ledger.ledgers;
      if (refundLedger.transactionType && refundLedger.transactionId) {
        const tType = refundLedger.transactionType;
        const tId = refundLedger.transactionId;
        let refundTxn: any = null;

        if (tType.includes("DepositTransaction")) {
          refundTxn = await prisma().depositTransaction.findUnique({
            where: { id: tId },
            select: { uniqueId: true, memo: true },
          });
        } else if (tType.includes("WalletTransaction")) {
          refundTxn = await prisma().walletTransaction.findUnique({
            where: { id: tId },
            select: { uniqueId: true },
          });
        } else if (tType.includes("BeneficiaryTransaction")) {
          refundTxn = await prisma().beneficiaryTransaction.findUnique({
            where: { id: tId },
            select: { uniqueId: true, txnRefNo: true },
          });
        }

        if (refundTxn) {
          res.refund_transaction = {
            unique_id: refundTxn.uniqueId,
            txn_ref_no: refundTxn.txnRefNo || refundTxn.memo || "",
          };
        }
      }
    }
  } catch {}

  return res;
}
