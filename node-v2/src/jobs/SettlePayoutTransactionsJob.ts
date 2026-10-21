import { Job, JobsOptions } from "bullmq";
import { Op } from "sequelize";
import PayoutTransaction from "../models/payout_transaction.model";
import PayoutTransactionArchive from "../models/payout_transaction_archive.model";
import BankWallet from "../models/bank_wallet.model";
import Wallet from "../models/wallet.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import Ledger from "../models/ledger.model";
import PayoutSettlement from "../models/payout_settlement.model";
import { enqueue } from "./config";
import sequelize from "../config/database";

export const SETTLE_PAYOUTS_JOB = "SettlePayouts";

export interface SettlePayoutsPayload {
    runId: string;
}

export const dispatchSettlePayoutTransactions = async (
    payload: SettlePayoutsPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(SETTLE_PAYOUTS_JOB, payload, {
        jobId: `settle-payouts-${payload.runId}`,
        ...options,
    });

const SETTLEMENT_STATUS_PENDING = "pending";
const SETTLEMENT_STATUS_APPLIED = "applied";
const SETTLEMENT_STATUS_DONE = "done";

const CHUNK = 1000;
const REFUNDED_STATUSES = ["5", "6", "7", "8"];

/**
 * Nightly payout sweeper (mirror of Laravel's settlement job): settles
 * completed queue rows against the funding balances, purges verified
 * refunds, archives everything it touched and journals each batch.
 */
class PayoutSettlementJobHandler {
    private skippedIds: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private report: Record<string, any> = {
        bank_settled_count: 0,
        bank_settled_amount: 0.0,
        wallet_settled_count: 0,
        wallet_settled_amount: 0.0,
        refunded_purged_count: 0,
        skipped_no_balance_row: 0,
        skipped_unverified_refund: 0,
        job_failed_excluded: 0,
        recovered_batches: 0,
    };

    public async handle(): Promise<void> {
        const started = Date.now();

        // 2:00 AM IST cutoff today.
        const cutoffDate = new Date();
        // IST is UTC+5:30 -> 2AM IST = 20:30 UTC the previous day.
        cutoffDate.setUTCHours(2 - 5, 30 - 30, 0, 0);
        if (cutoffDate.getTime() > Date.now()) {
            cutoffDate.setDate(cutoffDate.getDate() - 1);
        }

        // eslint-disable-next-line no-console
        console.log("Payout settlement started", {
            cutoff: cutoffDate.toISOString(),
        });

        await this.recover();

        await this.settleSuccess("bank", cutoffDate);
        await this.settleSuccess("wallet", cutoffDate);
        await this.purgeRefunded(cutoffDate);
        await this.reportJobFailed(cutoffDate);

        this.report["duration_seconds"] = (Date.now() - started) / 1000;
        // eslint-disable-next-line no-console
        console.log("Payout settlement summary", this.report);
    }

    private async recover(): Promise<void> {
        await PayoutSettlement.destroy({
            where: { status: SETTLEMENT_STATUS_PENDING },
        });

        const applied = await PayoutSettlement.findAll({
            where: { status: SETTLEMENT_STATUS_APPLIED },
            order: [["id", "ASC"]],
        });

        for (const journal of applied) {
            const rows = await PayoutTransaction.findAll({
                where: { id: { [Op.in]: journal.rowIds } },
            });

            await this.archiveAndDelete(rows, journal);
            await journal.update({ status: SETTLEMENT_STATUS_DONE });
            this.report["recovered_batches"]++;
        }
    }

    private async settleSuccess(
        sourceType: string,
        cutoff: Date,
    ): Promise<void> {
        for (;;) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const whereClause: any = {
                type: sourceType,
                payoutStatus: "2",
                status: "4",
                createdAt: { [Op.lte]: cutoff },
            };

            if (this.skippedIds.length > 0) {
                whereClause.id = { [Op.notIn]: this.skippedIds };
            }

            const rows = await PayoutTransaction.findAll({
                where: whereClause,
                order: [["id", "ASC"]],
                limit: CHUNK,
            });

            if (rows.length === 0) {
                return;
            }

            const groups = new Map<string, PayoutTransaction[]>();
            for (const r of rows) {
                const key =
                    sourceType === "bank"
                        ? `${r.userId}|${r.teamMemberId || ""}|${r.virtualAccountId || ""}|${r.sendingCurrency || ""}`
                        : `${r.walletId}`;

                if (!groups.has(key)) {
                    groups.set(key, []);
                }
                groups.get(key)!.push(r);
            }

            for (const groupRows of groups.values()) {
                if (sourceType === "bank") {
                    await this.settleBankGroup(groupRows);
                } else {
                    await this.settleWalletGroup(groupRows);
                }
            }
        }
    }

    private async settleBankGroup(rows: PayoutTransaction[]): Promise<void> {
        const first = rows[0];
        const total = rows.reduce(
            (sum, r) => sum + parseFloat(r.totalAmount?.toString() || "0"),
            0,
        );

        const bankWallet = await BankWallet.findOne({
            where: {
                userId: first.userId,
                virtualAccountId: first.virtualAccountId || null,
            },
        });

        if (!bankWallet) {
            this.skip(rows, "skipped_no_balance_row");
            return;
        }

        const journal = await this.journal(
            "bank_wallet",
            bankWallet.id,
            "success",
            rows,
            total,
        );

        await sequelize.transaction(async (t) => {
            await BankWallet.update(
                {
                    availableBalance: sequelize.literal(
                        `available_balance - ${total}`,
                    ),
                    usedBalance: sequelize.literal(`used_balance + ${total}`),
                    lastSyncAt: new Date(),
                },
                {
                    where: { id: bankWallet.id },
                    transaction: t,
                },
            );
            await journal.update(
                { status: SETTLEMENT_STATUS_APPLIED },
                { transaction: t },
            );
        });

        await this.archiveAndDelete(rows, journal);
        await journal.update({ status: SETTLEMENT_STATUS_DONE });

        this.report["bank_settled_count"] += rows.length;
        this.report["bank_settled_amount"] += total;
    }

    private async settleWalletGroup(rows: PayoutTransaction[]): Promise<void> {
        const first = rows[0];
        const total = rows.reduce(
            (sum, r) => sum + parseFloat(r.totalAmount?.toString() || "0"),
            0,
        );

        const wallet = await Wallet.findByPk(first.walletId || 0);

        if (!wallet) {
            this.skip(rows, "skipped_no_balance_row");
            return;
        }

        const journal = await this.journal(
            "wallet",
            wallet.id,
            "success",
            rows,
            total,
        );

        await sequelize.transaction(async (t) => {
            await Wallet.update(
                {
                    balance: sequelize.literal(`balance - ${total}`),
                },
                {
                    where: { id: wallet.id },
                    transaction: t,
                },
            );
            await journal.update(
                { status: SETTLEMENT_STATUS_APPLIED },
                { transaction: t },
            );
        });

        await this.archiveAndDelete(rows, journal);
        await journal.update({ status: SETTLEMENT_STATUS_DONE });

        this.report["wallet_settled_count"] += rows.length;
        this.report["wallet_settled_amount"] += total;
    }

    private async purgeRefunded(cutoff: Date): Promise<void> {
        for (;;) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const whereClause: any = {
                status: { [Op.in]: REFUNDED_STATUSES },
                createdAt: { [Op.lte]: cutoff },
            };

            if (this.skippedIds.length > 0) {
                whereClause.id = { [Op.notIn]: this.skippedIds };
            }

            const rows = await PayoutTransaction.findAll({
                where: whereClause,
                order: [["id", "ASC"]],
                limit: CHUNK,
            });

            if (rows.length === 0) {
                return;
            }

            const verifiedIds = await this.refundVerifiedIds(rows);

            const verified = rows.filter((r) => verifiedIds.includes(r.id));
            const unverified = rows.filter((r) => !verifiedIds.includes(r.id));

            if (unverified.length > 0) {
                this.skip(unverified, "skipped_unverified_refund");
            }

            if (verified.length > 0) {
                const total = verified.reduce(
                    (sum, r) =>
                        sum + parseFloat(r.totalAmount?.toString() || "0"),
                    0,
                );
                const journal = await this.journal(
                    null,
                    null,
                    "refunded",
                    verified,
                    total,
                );
                await this.archiveAndDelete(verified, journal);
                await journal.update({ status: SETTLEMENT_STATUS_DONE });
                this.report["refunded_purged_count"] += verified.length;
            }
        }
    }

    private async refundVerifiedIds(
        rows: PayoutTransaction[],
    ): Promise<number[]> {
        const orderIds = rows
            .map((r) => r.orderId)
            .filter(Boolean) as string[];
        if (orderIds.length === 0) {
            return [];
        }

        const txns = await BeneficiaryTransaction.findAll({
            where: { orderId: { [Op.in]: orderIds } },
            attributes: ["id", "orderId"],
        });
        if (txns.length === 0) {
            return [];
        }

        const txnIds = txns.map((t) => t.id);
        const ledgers = await Ledger.findAll({
            where: {
                // Morph map equivalent.
                transactionType: "App\\Models\\BeneficiaryTransaction",
                transactionId: { [Op.in]: txnIds },
            },
            attributes: ["id", "transactionId"],
        });

        const ledgerIds = ledgers.map((l) => l.id);
        const refundedLedgers = await Ledger.findAll({
            where: { refundLedgerId: { [Op.in]: ledgerIds } },
            attributes: ["refundLedgerId"],
        });
        const refundedLedgerIds = refundedLedgers
            .map((l) => l.refundLedgerId)
            .filter(Boolean) as number[];

        const ledgerByTxn = new Map(ledgers.map((l) => [l.transactionId, l]));
        const txnByOrder = new Map(txns.map((t) => [t.orderId, t]));

        return rows
            .filter((row) => {
                if (!row.orderId) {
                    return false;
                }
                const txn = txnByOrder.get(row.orderId);
                if (!txn) {
                    return false;
                }
                const ledger = ledgerByTxn.get(txn.id);
                return ledger && refundedLedgerIds.includes(ledger.id);
            })
            .map((r) => r.id);
    }

    private async reportJobFailed(cutoff: Date): Promise<void> {
        this.report["job_failed_excluded"] = await PayoutTransaction.count({
            where: {
                payoutStatus: "3",
                createdAt: { [Op.lte]: cutoff },
            },
        });
    }

    private async journal(
        scopeType: string | null,
        scopeId: number | null,
        bucket: string,
        rows: PayoutTransaction[],
        total: number,
    ): Promise<PayoutSettlement> {
        return await PayoutSettlement.create({
            runDate: new Date().toISOString().split("T")[0],
            scopeType,
            scopeId,
            bucket,
            rowIds: rows.map((r) => r.id),
            rowCount: rows.length,
            totalAmount: total,
            status: SETTLEMENT_STATUS_PENDING,
        });
    }

    private async archiveAndDelete(
        rows: PayoutTransaction[],
        journal: PayoutSettlement,
    ): Promise<void> {
        if (rows.length === 0) {
            return;
        }

        const now = new Date();
        const archiveRows = rows.map((r) => {
            const attrs = r.toJSON();
            return {
                ...attrs,
                payoutTransactionId: attrs.id,
                settlementId: journal.id,
                settledAt: now,
                originalCreatedAt: attrs.createdAt,
                originalUpdatedAt: attrs.updatedAt,
                createdAt: now,
                updatedAt: now,
            };
        });

        // Split into chunks of 500.
        for (let i = 0; i < archiveRows.length; i += 500) {
            const chunk = archiveRows.slice(i, i + 500);
            await PayoutTransactionArchive.bulkCreate(chunk, {
                ignoreDuplicates: true,
            });
        }

        await PayoutTransaction.destroy({
            where: { id: { [Op.in]: rows.map((r) => r.id) } },
        });
    }

    private skip(rows: PayoutTransaction[], counter: string): void {
        for (const row of rows) {
            this.skippedIds.push(row.id);
        }
        this.report[counter] += rows.length;
        // eslint-disable-next-line no-console
        console.warn(`Settlement skipped rows: ${counter}`, {
            count: rows.length,
            ids: rows.map((r) => r.id).slice(0, 20),
        });
    }
}

export const executeSettlePayoutTransactions = async (
    _job: Job,
): Promise<void> => {
    const handler = new PayoutSettlementJobHandler();
    await handler.handle();
};
