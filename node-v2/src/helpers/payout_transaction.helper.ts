import Decimal from "decimal.js";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { Dispatch } from "../jobs";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionStatusHistory from "../models/beneficiary_transaction_status_history.model";
import Ledger from "../models/ledger.model";
import Merchant from "../models/merchant.model";
import MerchantSetting from "../models/merchant_setting.model";
import PayoutJob from "../models/payout_job.model";
import Quote from "../models/quote.model";
import Sender from "../models/sender.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import { notifyBeneficiaryTransaction } from "../services/telegram.service";
import { computeBankBalance, getWalletBalance } from "./balance.helper";
import { transactionIncludes } from "./beneficiary_transaction.helper";
import { CodedError } from "./coded_error.helper";
import { getVirtualAccountScope } from "./virtual_account.helper";
import {
    generateTransactionRefNumber,
    generateUniqueId,
} from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_APPROVED,
    BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
    BENEFICIARY_TRANSACTION_INITIATED,
    BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
    MERCHANT_TYPE_PAYOUT,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    PAYOUT_JOB_STATUS_PENDING,
    QUOTE_SUBMITTED,
    SENDER_STATUS_DISABLED,
    TEAM_MEMBER_ROLE_CORPORATE,
    TEAM_MEMBER_ROLE_SUPPORT_MEMBER,
    TRANSACTION_TYPE_DEBIT,
    WALLET_STATUS_ACTIVE,
    WALLET_TRANSACTION_COMPLETED,
} from "../utils/constants";

/**
 * Mirror of BeneficiaryTransactionRepository::store (via the legacy
 * createPayoutTransaction). This is THE money-moving function —
 * ported with identical semantics per the migration mandate:
 *
 *   - the same validations, in the same order, with the same error
 *     codes and HTTP statuses
 *   - the same operations inside the DB transaction, in the same
 *     order: SELECT ... FOR UPDATE source lock -> balance gate ->
 *     transaction row -> status history -> quote SUBMITTED -> debit
 *     ledger anchor -> wallet debit (wallet sources) -> payout job
 *   - the balance is computed on the pool connection while the FOR
 *     UPDATE lock is held on the transaction connection, exactly like
 *     the legacy service
 *   - the queue dispatch fires after commit for APPROVED/INITIATED
 *     states only (CORPORATE_INITIATED waits for checker approval)
 *   - the fire-and-forget Telegram ops notification fires after
 *     dispatch, exactly like the legacy service
 */

export interface PayoutCreatePayload {
    beneficiary_account_id: string;
    quote_id: string;
    remitter_id?: string;
    remarks?: string;
    supporting_document?: string;
    txn_ref_no?: string;
    purpose_of_payment?: string;
    client_reference_id?: string;
    order_id?: string;
}

export interface CreatorContext {
    id: number;
    role: number;
    senderId?: number | null;
}

/**
 * Mirror of Helper::is_remitter_deposit_enabled — true only for
 * PAYOUT-type merchants with the 'enable_remitter_deposit' setting set
 * to '1'. Exported for the /direct flow and the sender form fields.
 */
export const isRemitterDepositEnabled = async (
    merchantId: number | null,
): Promise<boolean> => {
    if (!merchantId) {
        return false;
    }
    const merchant = await Merchant.findByPk(merchantId);
    if (!merchant || merchant.type !== MERCHANT_TYPE_PAYOUT) {
        return false;
    }
    const setting = await MerchantSetting.findOne({
        where: { merchantId: merchant.id, key: "enable_remitter_deposit" },
    });
    return setting?.value === "1";
};

/**
 * True when the merchant has the 'is_compliance_enabled' setting turned
 * on — such merchants' payouts are screened by the Compliance panel
 * before reaching the Processing Unit.
 */
export const isComplianceEnabled = async (
    merchantId: number | null,
): Promise<boolean> => {
    if (!merchantId) {
        return false;
    }
    const setting = await MerchantSetting.findOne({
        where: { merchantId, key: "is_compliance_enabled" },
    });
    return (
        setting?.value === "1" ||
        setting?.value?.toLowerCase() === "true"
    );
};

export const createPayoutTransaction = async (
    payload: PayoutCreatePayload,
    user: User,
    creator: CreatorContext | null = null,
): Promise<BeneficiaryTransaction> => {
    // 1. Duplicate client reference guard (187).
    if (payload.client_reference_id) {
        const duplicate = await BeneficiaryTransaction.findOne({
            where: {
                userId: user.id,
                clientReferenceId: payload.client_reference_id,
            },
        });
        if (duplicate) {
            throw new CodedError("Duplicate client_reference_id.", 187, 400);
        }
    }

    // 2. Creator role -> initial status.
    let finalStatus: number = BENEFICIARY_TRANSACTION_APPROVED;
    let resolvedSenderId: number | null = null;
    if (creator) {
        if (creator.role === TEAM_MEMBER_ROLE_SUPPORT_MEMBER) {
            finalStatus = BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;
        }
        if (creator.role === TEAM_MEMBER_ROLE_CORPORATE) {
            finalStatus = BENEFICIARY_TRANSACTION_CORPORATE_INITIATED;
            if (!creator.senderId) {
                throw new CodedError("Sender not found.", 132, 400);
            }
            resolvedSenderId = creator.senderId;
        }
    }

    // 3. Quote (121 / 153).
    const quote = await Quote.findOne({
        where: { uniqueId: payload.quote_id, userId: user.id },
    });
    if (!quote) {
        throw new CodedError("Quote not found.", 121, 400);
    }
    if (quote.status === QUOTE_SUBMITTED) {
        throw new CodedError("Quote already submitted.", 153, 400);
    }

    // 4. Beneficiary account + currency match (118 / 180).
    const beneficiaryAccount = await BeneficiaryAccount.findOne({
        where: { uniqueId: payload.beneficiary_account_id, userId: user.id },
    });
    if (!beneficiaryAccount) {
        throw new CodedError("Beneficiary account not found.", 118, 400);
    }
    if (
        beneficiaryAccount.currency &&
        quote.receivingCurrency &&
        beneficiaryAccount.currency !== quote.receivingCurrency
    ) {
        throw new CodedError(
            "Beneficiary currency does not match the quote receiving currency.",
            180,
            400,
        );
    }

    // 5. Source validation (balance locking is deferred into the
    //    transaction below to prevent race conditions).
    if (!quote.sourceType || !quote.sourceId) {
        throw new CodedError("Bank account not found.", 120, 400);
    }
    let sourceVirtualAccount: VirtualAccount | null = null;
    let sourceWallet: Wallet | null = null;

    if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
        const baseScope = await getVirtualAccountScope(user);
        sourceVirtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                id: quote.sourceId,
            },
        });
        if (!sourceVirtualAccount) {
            throw new CodedError("Bank account not found.", 120, 400);
        }
    } else if (quote.sourceType === MORPH_WALLET) {
        sourceWallet = await Wallet.findOne({
            where: { id: quote.sourceId, userId: user.id },
        });
        if (!sourceWallet) {
            throw new CodedError("Bank account not found.", 120, 400);
        }
        if (sourceWallet.status !== WALLET_STATUS_ACTIVE) {
            throw new CodedError("Wallet is not active.", 169, 400);
        }
    } else {
        throw new CodedError("Bank account not found.", 120, 400);
    }

    // 6. Sender resolution (143 / 132 / 203 / 200).
    if (payload.remitter_id) {
        if (!user.enableSender) {
            throw new CodedError("Sender not found.", 143, 400);
        }
        const sender = await Sender.findOne({
            where: { uniqueId: payload.remitter_id, userId: user.id },
        });
        if (!sender) {
            throw new CodedError("Sender not found.", 132, 400);
        }
        if (sender.status === SENDER_STATUS_DISABLED) {
            throw new CodedError("Sender is disabled.", 203, 400);
        }
        if (
            (beneficiaryAccount.currency === "PKR" &&
                sender.nationality === "IND") ||
            (beneficiaryAccount.currency === "INR" &&
                sender.nationality === "PAK")
        ) {
            throw new CodedError(
                "Sender nationality and beneficiary currency combination not allowed.",
                200,
                400,
            );
        }
        resolvedSenderId = sender.id;
    }

    // 7. Fees = commission + external + merchant commission.
    const fees = new Decimal(quote.commissionAmount)
        .plus(quote.externalCommissionAmount)
        .plus(quote.merchantCommissionAmount ?? 0);
    const quoteAmount = new Decimal(quote.amount);
    const amountPlusFees = quoteAmount.plus(fees);

    // 8. Reference number: client-supplied (196 on duplicate) or
    //    generated from the merchant/user scope.
    let txnRefNo: string;
    if (payload.txn_ref_no) {
        const existingRef = await BeneficiaryTransaction.findOne({
            where: { txnRefNo: payload.txn_ref_no },
        });
        if (existingRef) {
            throw new CodedError("Duplicate txn_ref_no.", 196, 400);
        }
        txnRefNo = payload.txn_ref_no;
    } else {
        txnRefNo = generateTransactionRefNumber(
            user.merchantId ? Number(user.merchantId) : Number(user.id),
        );
    }

    const remitterDepositEnabled = await isRemitterDepositEnabled(
        user.merchantId,
    );

    const created = await sequelize.transaction(
        async (databaseTransaction) => {
            // 8a. Pessimistic lock on the source row, then the balance
            // gate. The balance itself is computed on the pool
            // connection while this lock is held — identical to the
            // legacy service.
            let sourceBalance = new Decimal(0);

            if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
                await sequelize.query(
                    "SELECT id FROM virtual_accounts WHERE id = ? FOR UPDATE",
                    {
                        replacements: [sourceVirtualAccount!.id],
                        type: QueryTypes.SELECT,
                        transaction: databaseTransaction,
                    },
                );
                sourceBalance = await computeBankBalance(
                    user,
                    sourceVirtualAccount!,
                    creator
                        ? { role: creator.role, id: creator.id }
                        : null,
                );
            } else if (quote.sourceType === MORPH_WALLET) {
                await sequelize.query(
                    "SELECT id FROM wallets WHERE id = ? FOR UPDATE",
                    {
                        replacements: [sourceWallet!.id],
                        type: QueryTypes.SELECT,
                        transaction: databaseTransaction,
                    },
                );
                sourceBalance = await getWalletBalance(user, sourceWallet!);
            }

            if (
                !remitterDepositEnabled &&
                sourceBalance.lessThan(quoteAmount)
            ) {
                throw new CodedError("Insufficient balance.", 154, 400);
            }

            // 8b. Transaction row.
            const transactionRow = await BeneficiaryTransaction.create(
                {
                    uniqueId: generateUniqueId(24),
                    txnRefNo,
                    userId: user.id,
                    teamMemberId: creator?.id ?? null,
                    senderId: resolvedSenderId,
                    quoteId: quote.id,
                    beneficiaryAccountId: beneficiaryAccount.id,
                    amount: quote.amount,
                    commissionAmount: fees.toString(),
                    totalAmount: amountPlusFees.toString(),
                    recipientAmount: quote.receivingAmount,
                    receivingCurrency: quote.receivingCurrency,
                    externalType: quote.externalType,
                    rail: quote.paymentRail,
                    purposeOfPayment: payload.purpose_of_payment ?? null,
                    supportingDocument: payload.supporting_document ?? null,
                    remarks: payload.remarks ?? null,
                    clientReferenceId: payload.client_reference_id ?? null,
                    orderId:
                        payload.order_id ??
                        `TXN${Math.floor(Date.now() / 1000)
                            .toString()
                            .slice(-8)}${Math.random()
                            .toString(36)
                            .substring(2, 6)
                            .toUpperCase()}`,
                    status: finalStatus,
                },
                { transaction: databaseTransaction },
            );

            // 8c. Status history.
            await BeneficiaryTransactionStatusHistory.create(
                {
                    uniqueId: generateUniqueId(24),
                    beneficiaryTransactionId: transactionRow.id,
                    fromStatus: null,
                    toStatus: String(finalStatus),
                    changedBy: creator
                        ? String(creator.id)
                        : String(user.id),
                    changedByType: creator ? "team" : "user",
                    changedAt: new Date(),
                },
                { transaction: databaseTransaction },
            );

            // 8d. Quote -> SUBMITTED (prevents re-use).
            await Quote.update(
                { status: QUOTE_SUBMITTED },
                {
                    where: { id: quote.id },
                    transaction: databaseTransaction,
                },
            );

            // 8e. Debit ledger anchor (the refund chain finds this row
            // by transactionType + transactionId).
            await Ledger.create(
                {
                    uniqueId: generateUniqueId(24),
                    userId: user.id,
                    virtualAccountId:
                        quote.sourceType === MORPH_VIRTUAL_ACCOUNT
                            ? quote.sourceId
                            : null,
                    walletId:
                        quote.sourceType === MORPH_WALLET
                            ? quote.sourceId
                            : null,
                    transactionType: MORPH_BENEFICIARY_TRANSACTION,
                    transactionId: transactionRow.id,
                    balance: sourceBalance.minus(amountPlusFees).toString(),
                    externalType: quote.externalType,
                    description: `Payout ${transactionRow.uniqueId}`,
                },
                { transaction: databaseTransaction },
            );

            // 8f. Wallet debit (wallet sources only). Legacy quirk
            // preserved: WalletTransaction.amount stores the total
            // (base + fees), not the base amount alone.
            if (quote.sourceType === MORPH_WALLET) {
                await WalletTransaction.create(
                    {
                        uniqueId: generateUniqueId(24),
                        userId: user.id,
                        walletId: quote.sourceId!,
                        quoteId: quote.id,
                        beneficiaryTransactionId: transactionRow.id,
                        amount: amountPlusFees.toString(),
                        totalAmount: amountPlusFees.toString(),
                        fees: fees.toString(),
                        status: WALLET_TRANSACTION_COMPLETED,
                        type: TRANSACTION_TYPE_DEBIT,
                        balanceBefore: sourceBalance.toString(),
                        balanceAfter: sourceBalance
                            .minus(amountPlusFees)
                            .toString(),
                    },
                    { transaction: databaseTransaction },
                );
            }

            // 8g. Durable payout-job handle for retries / dashboards.
            const payoutJob = await PayoutJob.create(
                {
                    uniqueId: generateUniqueId(24),
                    userId: user.id,
                    beneficiaryTransactionId: transactionRow.id,
                    amount: amountPlusFees.toString(),
                    status: PAYOUT_JOB_STATUS_PENDING,
                    payload: {
                        beneficiaryAccountId: String(beneficiaryAccount.id),
                        quoteId: quote.uniqueId,
                        amount: String(quote.amount),
                        currency: quote.receivingCurrency,
                    },
                },
                { transaction: databaseTransaction },
            );

            return { transactionRow, payoutJob };
        },
    );

    // 9. Dispatch when the transaction is in a queueable state.
    //    CORPORATE_INITIATED is intentionally excluded — it must not
    //    dispatch until a checker approves it. Compliance-enabled
    //    merchants screen through the Compliance panel first (the
    //    approval webhook then queues the Processing Unit hand-off);
    //    everyone else goes straight to the Processing Unit.
    if (
        finalStatus === BENEFICIARY_TRANSACTION_APPROVED ||
        finalStatus === BENEFICIARY_TRANSACTION_INITIATED
    ) {
        const complianceEnabled = await isComplianceEnabled(
            user.merchantId,
        );
        if (complianceEnabled) {
            await Dispatch.compliance({
                action: "screen_transaction",
                transactionId: String(created.transactionRow.id),
                userId: String(user.id),
            });
        } else {
            await Dispatch.payout({
                beneficiaryTransactionId: String(created.transactionRow.id),
                payoutJobUniqueId: created.payoutJob.uniqueId,
                userId: String(user.id),
                source: "approval",
            });
        }
    }

    // Fire-and-forget ops notification (mirror of the legacy
    // TelegramNotifier call — never affects the response).
    void notifyBeneficiaryTransaction(created.transactionRow.id);

    // Reload with the response include tree (mirror of the legacy
    // findUniqueOrThrow reload) so the resource shaper sees the same
    // eagerly-loaded relations.
    const reloaded = await BeneficiaryTransaction.findOne({
        where: { id: created.transactionRow.id },
        include: transactionIncludes(),
    });
    return reloaded ?? created.transactionRow;
};
