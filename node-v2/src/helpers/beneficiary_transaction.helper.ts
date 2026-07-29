import { Includeable, Op } from "sequelize";
import sequelize from "../config/database";
import { isComplianceEnabled } from "./payout_transaction.helper";
import { Dispatch } from "../jobs";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionProof from "../models/beneficiary_transaction_proof.model";
import BeneficiaryTransactionStatusHistory from "../models/beneficiary_transaction_status_history.model";
import PayoutJob from "../models/payout_job.model";
import Quote from "../models/quote.model";
import Sender from "../models/sender.model";
import SenderDocument from "../models/sender_document.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import { notifyBeneficiaryTransaction } from "../services/telegram.service";
import { CodedError } from "./coded_error.helper";
import { createRefund } from "./refund.helper";
import { getVirtualAccountScope } from "./virtual_account.helper";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_APPROVED,
    BENEFICIARY_TRANSACTION_CANCELLED,
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
    BENEFICIARY_TRANSACTION_STATUS_MAP,
    BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_ROLE_CORPORATE,
} from "../utils/constants";

/**
 * Mirror of BeneficiaryTransactionRepository (via the legacy
 * beneficiaryTransactionService): pure-domain helpers the payout
 * controller composes. createPayoutTransaction itself lives in
 * payout_transaction.helper.ts.
 */

export interface TransactionListQuery {
    status?: string;
    from_date?: string;
    to_date?: string;
    bank_account_id?: string;
    wallet_id?: string;
    search_key?: string;
}

export interface TeamMemberContext {
    id: number;
    role: number;
    permission?: number;
}

interface BatchUpdateResult {
    updated_count: number;
    failed_count: number;
    success_transactions: { unique_id: string }[];
    failed_transactions: { unique_id: string; message: string }[];
}

/**
 * The eager-load set every transaction response is shaped from —
 * mirror of the legacy Prisma include tree. Relations that the legacy
 * Prisma include did NOT soft-delete-filter are loaded with
 * `paranoid: false` so historical rows keep resolving.
 */
export const transactionIncludes = (): Includeable[] => [
    {
        model: BeneficiaryAccount,
        as: "beneficiaryAccount",
        required: false,
        paranoid: false,
        include: [
            { model: BeneficiaryAdditionalDetail, as: "additionalDetails" },
        ],
    },
    { model: Quote, as: "quotes", required: false },
    {
        model: Sender,
        as: "senders",
        required: false,
        paranoid: false,
        include: [{ model: SenderDocument, as: "documents" }],
    },
    { model: TeamMember, as: "team_members", required: false, paranoid: false },
    { model: User, as: "users", required: false },
    { model: BeneficiaryTransactionProof, as: "proofs", required: false },
];

interface ListFilter {
    where: Record<string | symbol, unknown>;
    filterIncludes: Includeable[];
}

/**
 * Mirror of the search branch in
 * BeneficiaryTransactionRepository::list. Returns the top-level where
 * clause plus the joins needed to evaluate it (a required join on the
 * quote for source filters, a left join on the beneficiary account for
 * search).
 */
export const buildListFilter = async (
    user: User,
    query: TransactionListQuery,
    teamMember: TeamMemberContext | null = null,
): Promise<ListFilter> => {
    const where: Record<string | symbol, unknown> = { userId: user.id };
    const filterIncludes: Includeable[] = [];

    if (teamMember && teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
        where.teamMemberId = teamMember.id;
    }

    if (query.status) {
        const statusValue = BENEFICIARY_TRANSACTION_STATUS_MAP[query.status];
        if (statusValue !== undefined) {
            if (statusValue === BENEFICIARY_TRANSACTION_PROCESSING) {
                where.status = {
                    [Op.in]: [
                        BENEFICIARY_TRANSACTION_APPROVED,
                        BENEFICIARY_TRANSACTION_INITIATED,
                        BENEFICIARY_TRANSACTION_PROCESSING,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
                        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
                        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
                        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
                    ],
                };
            } else if (statusValue === BENEFICIARY_TRANSACTION_FAILED) {
                where.status = {
                    [Op.in]: [
                        BENEFICIARY_TRANSACTION_FAILED,
                        BENEFICIARY_TRANSACTION_EXPIRED,
                        BENEFICIARY_TRANSACTION_CANCELLED,
                        BENEFICIARY_TRANSACTION_REJECTED,
                    ],
                };
            } else {
                where.status = statusValue;
            }
        }
    }

    if (query.from_date && query.to_date) {
        where.createdAt = {
            [Op.gte]: new Date(`${query.from_date}T00:00:00Z`),
            [Op.lte]: new Date(`${query.to_date}T23:59:59Z`),
        };
    }

    let quoteWhere: Record<string, unknown> | null = null;
    if (query.bank_account_id) {
        const baseScope = await getVirtualAccountScope(user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: query.bank_account_id,
            },
        });
        if (!virtualAccount) {
            throw new CodedError("Bank account not found.", 120, 400);
        }
        quoteWhere = {
            sourceId: virtualAccount.id,
            sourceType: MORPH_VIRTUAL_ACCOUNT,
        };
    }
    if (query.wallet_id) {
        const wallet = await Wallet.findOne({
            where: { uniqueId: query.wallet_id, userId: user.id },
        });
        if (!wallet) {
            throw new CodedError("Wallet not found.", 167, 400);
        }
        quoteWhere = { sourceId: wallet.id, sourceType: MORPH_WALLET };
    }
    if (quoteWhere) {
        filterIncludes.push({
            model: Quote,
            as: "quotes",
            where: quoteWhere,
            required: true,
            attributes: [],
        });
    }

    if (query.search_key) {
        const searchTerm = `%${query.search_key}%`;
        where[Op.or] = [
            { uniqueId: { [Op.like]: searchTerm } },
            { txnRefNo: { [Op.like]: searchTerm } },
            { remarks: { [Op.like]: searchTerm } },
            { externalReferenceId: { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.account_number$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.bank_name$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.swift_code$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.routing_number$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.account_name$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.first_name$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.last_name$": { [Op.like]: searchTerm } },
            { "$beneficiaryAccount.business_name$": { [Op.like]: searchTerm } },
        ];
        filterIncludes.push({
            model: BeneficiaryAccount,
            as: "beneficiaryAccount",
            required: false,
            paranoid: false,
            attributes: [],
        });
    }

    return { where, filterIncludes };
};

/**
 * Paged transaction list: count + rows with the full include tree.
 * The id page is resolved first (with only the filter joins) so the
 * hasMany relations in the full include tree can't distort LIMIT.
 */
export const listTransactions = async (
    user: User,
    query: TransactionListQuery & { skip: number; take: number },
    teamMember: TeamMemberContext | null = null,
): Promise<{ total: number; rows: BeneficiaryTransaction[] }> => {
    const { where, filterIncludes } = await buildListFilter(
        user,
        query,
        teamMember,
    );

    const [total, idRows] = await Promise.all([
        BeneficiaryTransaction.count({
            where,
            include: filterIncludes,
            distinct: true,
            col: "id",
        }),
        BeneficiaryTransaction.findAll({
            where,
            include: filterIncludes,
            order: [["created_at", "DESC"]],
            offset: query.skip,
            limit: query.take,
            attributes: ["id"],
            subQuery: false,
            raw: true,
        }),
    ]);

    const pageIds = idRows.map((row) => row.id);
    if (pageIds.length === 0) {
        return { total, rows: [] };
    }

    const rows = await BeneficiaryTransaction.findAll({
        where: { id: { [Op.in]: pageIds } },
        include: transactionIncludes(),
        order: [["created_at", "DESC"]],
    });
    return { total, rows };
};

/**
 * Resolves a transaction owned by the user via any of the public
 * identifiers (mirror of the controller-level findOneByAnyId).
 */
export const findTransactionByAnyId = async (
    userId: number,
    ids: {
        beneficiary_transaction_id?: string;
        txn_ref_no?: string;
        client_reference_id?: string;
    },
): Promise<BeneficiaryTransaction | null> => {
    const identifierClauses: Record<string, unknown>[] = [];
    if (ids.beneficiary_transaction_id) {
        identifierClauses.push({ uniqueId: ids.beneficiary_transaction_id });
    }
    if (ids.txn_ref_no) {
        identifierClauses.push({ txnRefNo: ids.txn_ref_no });
    }
    if (ids.client_reference_id) {
        identifierClauses.push({ clientReferenceId: ids.client_reference_id });
    }
    if (identifierClauses.length === 0) {
        return null;
    }
    return BeneficiaryTransaction.findOne({
        where: { userId, [Op.or]: identifierClauses },
        include: transactionIncludes(),
    });
};

/**
 * Mirror of BeneficiaryTransactionRepository::cancel. Each id is
 * processed independently; failures collect per-transaction messages
 * instead of aborting the batch.
 */
export const cancelTransactions = async (
    user: User,
    uniqueIds: string[],
    remarks?: string,
): Promise<BatchUpdateResult> => {
    const successTransactions: { unique_id: string }[] = [];
    const failedTransactions: { unique_id: string; message: string }[] = [];

    for (const transactionUniqueId of uniqueIds) {
        try {
            const updated = await sequelize.transaction(
                async (databaseTransaction) => {
                    const transactionRow =
                        await BeneficiaryTransaction.findOne({
                            where: {
                                userId: user.id,
                                uniqueId: transactionUniqueId,
                            },
                            transaction: databaseTransaction,
                        });
                    if (!transactionRow) {
                        throw new CodedError("Transaction not found.", 124, 400);
                    }
                    const allowedForCancellation = [
                        BENEFICIARY_TRANSACTION_INITIATED,
                        BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
                        BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
                    ];
                    if (!allowedForCancellation.includes(transactionRow.status)) {
                        throw new CodedError(
                            "Transaction cannot be cancelled at this stage.",
                            155,
                            400,
                        );
                    }
                    transactionRow.status = BENEFICIARY_TRANSACTION_CANCELLED;
                    transactionRow.notes = remarks ?? null;
                    return transactionRow.save({
                        transaction: databaseTransaction,
                    });
                },
            );
            await createRefund(updated);
            successTransactions.push({ unique_id: updated.uniqueId });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            failedTransactions.push({
                unique_id: transactionUniqueId,
                message,
            });
        }
    }

    return {
        updated_count: successTransactions.length,
        failed_count: failedTransactions.length,
        success_transactions: successTransactions,
        failed_transactions: failedTransactions,
    };
};

/**
 * Mirror of BeneficiaryTransactionRepository::updateStatus. Maker
 * team members can only move CORPORATE_INITIATED transactions into
 * WAITING_FOR_APPROVAL; everyone else applies APPROVED/REJECTED to
 * transactions waiting on a decision. REJECTED triggers the refund
 * chain; APPROVED re-dispatches through the payout queue. Each
 * successful update fires the fire-and-forget Telegram notification,
 * exactly like the legacy service.
 */
export const updateTransactionStatus = async (
    user: User,
    uniqueIds: string[],
    status: number,
    remarks?: string,
    teamMember: TeamMemberContext | null = null,
): Promise<BatchUpdateResult> => {
    const successTransactions: { unique_id: string }[] = [];
    const failedTransactions: { unique_id: string; message: string }[] = [];

    for (const transactionUniqueId of uniqueIds) {
        try {
            const updated = await sequelize.transaction(
                async (databaseTransaction) => {
                    const transactionRow =
                        await BeneficiaryTransaction.findOne({
                            where: {
                                userId: user.id,
                                uniqueId: transactionUniqueId,
                            },
                            transaction: databaseTransaction,
                        });
                    if (!transactionRow) {
                        throw new CodedError("Transaction not found.", 124, 400);
                    }

                    let resolvedStatus = status;
                    if (
                        teamMember &&
                        teamMember.permission === TEAM_MEMBER_PERMISSION_MAKER
                    ) {
                        if (
                            transactionRow.status !==
                            BENEFICIARY_TRANSACTION_CORPORATE_INITIATED
                        ) {
                            throw new CodedError(
                                "Transaction is not in an updatable state.",
                                162,
                                400,
                            );
                        }
                        resolvedStatus =
                            BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;
                    } else {
                        const allowed = [
                            BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
                            BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
                        ];
                        if (!allowed.includes(transactionRow.status)) {
                            throw new CodedError(
                                "Transaction is not in an updatable state.",
                                162,
                                400,
                            );
                        }
                    }

                    transactionRow.status = resolvedStatus;
                    transactionRow.notes = remarks ?? null;
                    return transactionRow.save({
                        transaction: databaseTransaction,
                    });
                },
            );

            if (updated.status === BENEFICIARY_TRANSACTION_REJECTED) {
                await createRefund(updated);
            } else if (updated.status === BENEFICIARY_TRANSACTION_APPROVED) {
                // Re-dispatch through the payout queue. The PayoutJob
                // row was created at /store time; reuse the latest one.
                const payoutJob = await PayoutJob.findOne({
                    where: { beneficiaryTransactionId: updated.id },
                    order: [["id", "DESC"]],
                });

                if (payoutJob) {
                    const complianceEnabled = await isComplianceEnabled();
                    if (complianceEnabled) {
                        await Dispatch.compliance({
                            action: "screen_transaction",
                            transactionId: String(updated.id),
                            userId: String(user.id),
                        });
                    } else {
                        await Dispatch.payout({
                            beneficiaryTransactionId: String(updated.id),
                            payoutJobUniqueId: payoutJob.uniqueId,
                            userId: String(user.id),
                            source: "approval",
                        });
                    }
                }
            }
            void notifyBeneficiaryTransaction(updated.id);
            successTransactions.push({ unique_id: updated.uniqueId });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            failedTransactions.push({
                unique_id: transactionUniqueId,
                message,
            });
        }
    }

    return {
        updated_count: successTransactions.length,
        failed_count: failedTransactions.length,
        success_transactions: successTransactions,
        failed_transactions: failedTransactions,
    };
};

/**
 * Status-history writer for flows outside createPayoutTransaction
 * (external service callbacks, workers). Mirror of
 * beneficiaryTransactionService.recordStatusHistory.
 */
export const recordStatusHistory = async (
    beneficiaryTransactionId: number,
    fromStatus: number | null,
    toStatus: number,
    changedBy: string,
    changedByType: string,
    meta?: Record<string, unknown>,
): Promise<void> => {
    await BeneficiaryTransactionStatusHistory.create({
        uniqueId: generateUniqueId(24),
        beneficiaryTransactionId,
        fromStatus: fromStatus !== null ? String(fromStatus) : null,
        toStatus: String(toStatus),
        changedBy,
        changedByType,
        changedAt: new Date(),
        meta: meta ?? null,
    });
};
