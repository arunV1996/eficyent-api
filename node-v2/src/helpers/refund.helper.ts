import Decimal from "decimal.js";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Ledger from "../models/ledger.model";
import Quote from "../models/quote.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import { computeBankBalance } from "./balance.helper";
import { generateUniqueId } from "../utils/common.utils";
import {
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TYPE_REFUND,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_DEPOSIT_TRANSACTION,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    MORPH_WALLET_TRANSACTION,
    TRANSACTION_TYPE_CREDIT,
    TRANSACTION_TYPE_DEBIT,
    WALLET_TRANSACTION_COMPLETED,
} from "../utils/constants";

/**
 * Mirror of Helper::create_refund (via the legacy refundService). When
 * a beneficiary transaction is cancelled or rejected the money goes
 * back into the source:
 *
 *   - Wallet source         -> credit WalletTransaction
 *   - VirtualAccount source -> credit DepositTransaction (type=refund)
 *
 * Both branches also write a Ledger row chained to the original debit
 * anchor via `refund_ledger_id`, so the audit trail is queryable both
 * ways. The function is idempotent: repeat calls find the existing
 * `refund_ledger_id == originalLedger.id` row and short-circuit.
 */
export const createRefund = async (
    transaction: BeneficiaryTransaction,
): Promise<boolean> => {
    // The original ledger row for this transaction (written at create
    // time by createPayoutTransaction). If absent, nothing to refund.
    const originalLedger = await Ledger.findOne({
        where: {
            transactionType: MORPH_BENEFICIARY_TRANSACTION,
            transactionId: transaction.id,
        },
    });
    if (!originalLedger) {
        return false;
    }

    // Has this refund already been processed?
    const existingRefund = await Ledger.findOne({
        where: { refundLedgerId: originalLedger.id },
    });
    if (existingRefund) {
        return false;
    }

    if (!transaction.quoteId) {
        return false;
    }
    const quote = await Quote.findByPk(transaction.quoteId);
    if (!quote || !quote.sourceType || !quote.sourceId) {
        return false;
    }

    await sequelize.transaction(async (databaseTransaction) => {
        if (quote.sourceType === MORPH_WALLET) {
            const wallet = await Wallet.findOne({
                where: { id: quote.sourceId!, userId: transaction.userId },
            });
            if (!wallet) {
                return;
            }

            // Pessimistic lock on the wallet row to serialize
            // concurrent credits/debits.
            await sequelize.query(
                "SELECT id FROM wallets WHERE id = ? FOR UPDATE",
                {
                    replacements: [wallet.id],
                    type: QueryTypes.SELECT,
                    transaction: databaseTransaction,
                },
            );

            // Sum existing wallet credits/debits for
            // balance_before/balance_after. Legacy quirk preserved:
            // credits are filtered to COMPLETED, debits are not.
            const [creditSum, debitSum] = await Promise.all([
                WalletTransaction.sum("totalAmount", {
                    where: {
                        walletId: wallet.id,
                        userId: transaction.userId,
                        type: TRANSACTION_TYPE_CREDIT,
                        status: WALLET_TRANSACTION_COMPLETED,
                    },
                    transaction: databaseTransaction,
                }),
                WalletTransaction.sum("totalAmount", {
                    where: {
                        walletId: wallet.id,
                        userId: transaction.userId,
                        type: TRANSACTION_TYPE_DEBIT,
                    },
                    transaction: databaseTransaction,
                }),
            ]);
            const balance = new Decimal(String(creditSum ?? 0)).minus(
                String(debitSum ?? 0),
            );

            const refundWalletTransaction = await WalletTransaction.create(
                {
                    uniqueId: generateUniqueId(24),
                    userId: transaction.userId,
                    walletId: wallet.id,
                    quoteId: quote.id,
                    beneficiaryTransactionId: transaction.id,
                    amount: transaction.totalAmount,
                    totalAmount: transaction.totalAmount,
                    fees: "0",
                    status: WALLET_TRANSACTION_COMPLETED,
                    type: TRANSACTION_TYPE_CREDIT,
                    balanceBefore: balance.toString(),
                    balanceAfter: balance
                        .plus(transaction.totalAmount)
                        .toString(),
                },
                { transaction: databaseTransaction },
            );
            await Ledger.create(
                {
                    uniqueId: generateUniqueId(24),
                    userId: transaction.userId,
                    walletId: wallet.id,
                    virtualAccountId: null,
                    transactionType: MORPH_WALLET_TRANSACTION,
                    transactionId: refundWalletTransaction.id,
                    balance: balance.plus(transaction.totalAmount).toString(),
                    externalType: transaction.externalType ?? null,
                    description: `Refund for ${transaction.uniqueId}`,
                    refundLedgerId: originalLedger.id,
                },
                { transaction: databaseTransaction },
            );
            return;
        }

        if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
            const virtualAccount = await VirtualAccount.findByPk(
                quote.sourceId!,
            );
            if (!virtualAccount) {
                return;
            }

            // Pessimistic lock on the virtual-account row to serialize
            // concurrent credits/debits.
            await sequelize.query(
                "SELECT id FROM virtual_accounts WHERE id = ? FOR UPDATE",
                {
                    replacements: [virtualAccount.id],
                    type: QueryTypes.SELECT,
                    transaction: databaseTransaction,
                },
            );

            const refundDeposit = await DepositTransaction.create(
                {
                    uniqueId: generateUniqueId(24),
                    userId: transaction.userId,
                    teamMemberId: transaction.teamMemberId,
                    virtualAccountId: virtualAccount.id,
                    amount: transaction.totalAmount,
                    totalAmount: transaction.totalAmount,
                    status: DEPOSIT_TRANSACTION_COMPLETED,
                    type: DEPOSIT_TYPE_REFUND,
                },
                { transaction: databaseTransaction },
            );

            let teamMemberContext: { role: number; id: number } | null = null;
            if (transaction.teamMemberId) {
                const teamMember = await TeamMember.findByPk(
                    transaction.teamMemberId,
                );
                if (teamMember) {
                    teamMemberContext = {
                        role: teamMember.role,
                        id: teamMember.id,
                    };
                }
            }

            // Load the real user row — computeBankBalance reads
            // user.merchantId to decide whether to apply the
            // PAYINCOLLECTION memo filter on deposits. Legacy behavior
            // preserved: the balance is computed on the pool connection
            // while the FOR UPDATE lock is held above.
            const refundUser = await User.findByPk(transaction.userId);
            if (!refundUser) {
                return;
            }
            const oldBalance = await computeBankBalance(
                refundUser,
                virtualAccount,
                teamMemberContext,
            );
            const freshBalance = oldBalance.plus(transaction.totalAmount);

            await Ledger.create(
                {
                    uniqueId: generateUniqueId(24),
                    userId: transaction.userId,
                    virtualAccountId: virtualAccount.id,
                    walletId: null,
                    transactionType: MORPH_DEPOSIT_TRANSACTION,
                    transactionId: refundDeposit.id,
                    balance: freshBalance.toString(),
                    externalType: transaction.externalType ?? null,
                    description: `Refund for ${transaction.uniqueId}`,
                    refundLedgerId: originalLedger.id,
                },
                { transaction: databaseTransaction },
            );
        }
    });

    return true;
};

/**
 * Mirror of the legacy reverseRefund — when a FAILED payout flips back
 * to initiated/processing/completed after a refund was already issued,
 * the refund chain (the credit WalletTransaction or refund
 * DepositTransaction plus its Ledger row) is deleted so the money is
 * debited again. Hard deletes, mirroring the Prisma `.delete` calls.
 */
export const reverseRefund = async (
    transaction: BeneficiaryTransaction,
): Promise<boolean> => {
    const originalLedger = await Ledger.findOne({
        where: {
            transactionType: MORPH_BENEFICIARY_TRANSACTION,
            transactionId: transaction.id,
        },
    });
    if (!originalLedger) {
        return false;
    }

    const refundLedger = await Ledger.findOne({
        where: { refundLedgerId: originalLedger.id },
    });
    if (!refundLedger) {
        return false;
    }

    await sequelize.transaction(async (databaseTransaction) => {
        if (refundLedger.transactionId) {
            if (refundLedger.transactionType === MORPH_WALLET_TRANSACTION) {
                await WalletTransaction.destroy({
                    where: { id: refundLedger.transactionId },
                    transaction: databaseTransaction,
                });
            } else if (
                refundLedger.transactionType === MORPH_DEPOSIT_TRANSACTION
            ) {
                await DepositTransaction.destroy({
                    where: { id: refundLedger.transactionId },
                    transaction: databaseTransaction,
                });
            }
        }
        await Ledger.destroy({
            where: { id: refundLedger.id },
            transaction: databaseTransaction,
        });
    });

    // eslint-disable-next-line no-console
    console.info(
        `Refund chain reversed (deleted) for transaction ${transaction.uniqueId}`,
    );
    return true;
};
