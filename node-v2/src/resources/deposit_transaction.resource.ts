import Decimal from "decimal.js";
import AdminWallet from "../models/admin_wallet.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Ledger from "../models/ledger.model";
import VirtualAccount from "../models/virtual_account.model";
import WalletTransaction from "../models/wallet_transaction.model";
import { temporaryUrl } from "../services/s3.service";
import {
    depositTransactionStatusLabel,
    formatDateHuman,
} from "../utils/common.utils";
import {
    DEPOSIT_PURPOSE,
    DEPOSIT_SOURCE_OF_FUNDS,
    MORPH_DEPOSIT_TRANSACTION,
} from "../utils/constants";

/**
 * Mirror of App\Http\Resources\DepositTransactionResource (via the
 * legacy depositResource.ts). Optional keys (proof,
 * client_reference_id, remarks, wallet fields, refund_transaction)
 * appear only when populated — same conditional shape as legacy.
 */

export interface DepositTransactionDto {
    unique_id: string;
    memo: string;
    amount: string;
    fee: string;
    total_amount: string;
    currency: string;
    type: string | null;
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

const depositTypeLabel = (value: string | null | undefined): string | null => {
    if (!value) {
        return null;
    }
    switch (value.toLowerCase()) {
        case "deposit":
            return "DEPOSIT";
        case "refund":
            return "REFUND";
        case "topup":
            return "TOPUP";
        case "credit":
            return "CREDIT";
        case "premium":
            return "PREMIUM";
        case "charges":
            return "CHARGES";
        default:
            return null;
    }
};

export const depositTransactionToJSON = async (
    deposit: DepositTransaction & {
        virtualAccount?: VirtualAccount | null;
        admin_wallets?: AdminWallet | null;
    },
): Promise<DepositTransactionDto> => {
    // Resolve the virtual-account currency (falls back to a fetch when
    // the relation wasn't preloaded).
    let virtualAccountCurrency = "USD";
    if (deposit.virtualAccount) {
        virtualAccountCurrency = deposit.virtualAccount.currency;
    } else if (deposit.virtualAccountId) {
        try {
            const virtualAccount = await VirtualAccount.findByPk(
                deposit.virtualAccountId,
                { attributes: ["currency"] },
            );
            if (virtualAccount?.currency) {
                virtualAccountCurrency = virtualAccount.currency;
            }
        } catch {
            // Ignored — keep the default.
        }
    }
    const currency = (
        deposit.depositCurrency || virtualAccountCurrency
    ).toUpperCase();

    const dto: DepositTransactionDto = {
        unique_id: deposit.uniqueId,
        memo: deposit.memo || "",
        amount: new Decimal(deposit.amount).toFixed(2),
        fee: `${new Decimal(deposit.totalCommissionAmount).toFixed(2)} ${currency}`,
        total_amount: new Decimal(deposit.totalAmount).toFixed(2),
        currency,
        type: depositTypeLabel(deposit.type),
        purpose_of_payment: deposit.purposeOfPayment
            ? DEPOSIT_PURPOSE[deposit.purposeOfPayment] ??
              deposit.purposeOfPayment
            : "",
        source_of_funds: deposit.sourceOfFunds
            ? DEPOSIT_SOURCE_OF_FUNDS[deposit.sourceOfFunds] ??
              deposit.sourceOfFunds
            : "",
        status: depositTransactionStatusLabel(deposit.status),
        created_at: formatDateHuman(deposit.createdAt || new Date()),
        deposit_currency: deposit.depositCurrency || currency,
    };

    if (deposit.proof) {
        try {
            dto.proof = await temporaryUrl(deposit.proof);
        } catch {
            dto.proof = "";
        }
    }

    if (deposit.clientReferenceId) {
        dto.client_reference_id = deposit.clientReferenceId;
    }

    if (deposit.remarks) {
        dto.remarks = deposit.remarks;
    }

    if (deposit.fromWalletAddress) {
        dto.from_wallet_address = deposit.fromWalletAddress;
    }

    // Destination admin wallet (crypto deposits).
    let toWalletAddress = "";
    if (deposit.admin_wallets) {
        toWalletAddress = deposit.admin_wallets.walletAddress || "";
    } else if (deposit.adminWalletId) {
        try {
            const adminWallet = await AdminWallet.findByPk(
                deposit.adminWalletId,
                { attributes: ["walletAddress"], paranoid: false },
            );
            if (adminWallet?.walletAddress) {
                toWalletAddress = adminWallet.walletAddress;
            }
        } catch {
            // Ignored — key omitted.
        }
    }
    if (toWalletAddress) {
        dto.to_wallet = toWalletAddress;
    }

    if (deposit.transactionHash) {
        dto.transaction_hash = deposit.transactionHash;
    }

    // Refund chain: a refund-type deposit's ledger row points (via
    // refund_ledger_id) at the ledger of the transaction it refunds.
    try {
        const depositLedger = await Ledger.findOne({
            where: {
                transactionType: MORPH_DEPOSIT_TRANSACTION,
                transactionId: deposit.id,
            },
        });

        if (depositLedger?.refundLedgerId) {
            const refundedLedger = await Ledger.findByPk(
                depositLedger.refundLedgerId,
            );
            if (
                refundedLedger?.transactionType &&
                refundedLedger.transactionId
            ) {
                const refundedType = refundedLedger.transactionType;
                const refundedId = refundedLedger.transactionId;
                let refundedTransaction: {
                    uniqueId: string;
                    txnRefNo?: string | null;
                    memo?: string | null;
                } | null = null;

                if (refundedType.includes("DepositTransaction")) {
                    refundedTransaction = await DepositTransaction.findByPk(
                        refundedId,
                        { attributes: ["uniqueId", "memo"] },
                    );
                } else if (refundedType.includes("WalletTransaction")) {
                    refundedTransaction = await WalletTransaction.findByPk(
                        refundedId,
                        { attributes: ["uniqueId"] },
                    );
                } else if (refundedType.includes("BeneficiaryTransaction")) {
                    refundedTransaction =
                        await BeneficiaryTransaction.findByPk(refundedId, {
                            attributes: ["uniqueId", "txnRefNo"],
                        });
                }

                if (refundedTransaction) {
                    dto.refund_transaction = {
                        unique_id: refundedTransaction.uniqueId,
                        txn_ref_no:
                            refundedTransaction.txnRefNo ||
                            refundedTransaction.memo ||
                            "",
                    };
                }
            }
        }
    } catch {
        // Ignored — key omitted.
    }

    return dto;
};
