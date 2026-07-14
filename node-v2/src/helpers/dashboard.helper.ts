import getSymbolFromCurrency from "currency-symbol-map";
import { Op } from "sequelize";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import Quote from "../models/quote.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import { CodedError } from "./coded_error.helper";
import { settingGet } from "./setting.helper";
import { getVirtualAccountScope } from "./virtual_account.helper";
import {
    BENEFICIARY_TRANSACTION_APPROVED,
    BENEFICIARY_TRANSACTION_CANCELLED,
    BENEFICIARY_TRANSACTION_COMPLETED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    BENEFICIARY_TRANSACTION_EXPIRED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_INITIATED,
    BENEFICIARY_TRANSACTION_PROCESSING,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    BENEFICIARY_TRANSACTION_REJECTED,
    BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    QUOTE_SUBMITTED,
} from "../utils/constants";

/**
 * Mirror of App\Repositories\DashboardRepository (via the legacy
 * dashboardService):
 *
 *   - statistics(): totals + today, scoped by user and the optional
 *     virtual account / wallet source
 *   - chartsData(): last_x_days totals + per-status counts
 *
 * Rows are pulled and aggregated in TS exactly like the legacy service
 * (the multi-status CASE WHEN aggregation) so every number matches.
 *
 * Deferred with the team module: the CORPORATE team-member narrowing
 * argument (creator context is always the user here).
 */

const FAILED_STATUSES = [
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_EXPIRED,
    BENEFICIARY_TRANSACTION_CANCELLED,
    BENEFICIARY_TRANSACTION_REJECTED,
];

const PENDING_STATUSES = [
    BENEFICIARY_TRANSACTION_APPROVED,
    BENEFICIARY_TRANSACTION_INITIATED,
    BENEFICIARY_TRANSACTION_PROCESSING,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
    BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
];

export interface DashboardFilters {
    bank_account_id?: string;
    wallet_id?: string;
    last_x_days?: number;
}

interface ResolvedScope {
    bankAccountId: number | null;
    walletId: number | null;
    currency?: string;
}

const resolveScope = async (
    filters: DashboardFilters,
    user: User,
): Promise<ResolvedScope> => {
    let bankAccountId: number | null = null;
    let walletId: number | null = null;
    let currency: string | undefined;

    if (filters.bank_account_id) {
        const baseScope = await getVirtualAccountScope(user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: filters.bank_account_id,
            },
            attributes: ["id", "currency"],
        });
        if (!virtualAccount) {
            throw new CodedError("Bank account not found.", 120, 400);
        }
        bankAccountId = virtualAccount.id;
        if (virtualAccount.currency) {
            currency = virtualAccount.currency;
        }
    }
    if (filters.wallet_id) {
        const wallet = await Wallet.findOne({
            where: { uniqueId: filters.wallet_id, userId: user.id },
            attributes: ["id", "currency"],
        });
        if (!wallet) {
            throw new CodedError("Wallet not found.", 167, 400);
        }
        walletId = wallet.id;
        if (wallet.currency) {
            currency = wallet.currency;
        }
    }
    return { bankAccountId, walletId, currency };
};

/**
 * Quote ids for the selected source that are either SUBMITTED or have
 * at least one beneficiary transaction (mirror of the legacy
 * quoteSourceIds, including the both-filters-supplied quirk that
 * matches zero rows).
 */
const quoteSourceIds = async (
    scope: ResolvedScope,
): Promise<number[] | null> => {
    if (scope.bankAccountId && scope.walletId) {
        return [];
    }
    const sourceId = scope.bankAccountId ?? scope.walletId;
    if (!sourceId) {
        return null;
    }
    const sourceType = scope.bankAccountId ? MORPH_VIRTUAL_ACCOUNT : MORPH_WALLET;

    const quotes = await Quote.findAll({
        where: { sourceId, sourceType },
        attributes: ["id", "status"],
    });
    if (quotes.length === 0) {
        return [];
    }
    const quoteIds = quotes.map((quote) => quote.id);
    const transactionQuoteRows = (await BeneficiaryTransaction.findAll({
        where: { quoteId: { [Op.in]: quoteIds } },
        attributes: ["quoteId"],
        raw: true,
    })) as unknown as { quoteId: number }[];
    const quotesWithTransactions = new Set(
        transactionQuoteRows.map((row) => row.quoteId),
    );

    return quotes
        .filter(
            (quote) =>
                quote.status === QUOTE_SUBMITTED ||
                quotesWithTransactions.has(quote.id),
        )
        .map((quote) => quote.id);
};

const buildWhere = (
    user: User,
    scope: ResolvedScope,
    quoteIds: number[] | null,
): Record<string, unknown> => {
    const where: Record<string, unknown> = { userId: user.id };
    if ((scope.bankAccountId || scope.walletId) && quoteIds) {
        if (quoteIds.length === 0) {
            // Source matched zero quotes — impossible filter, zero rows.
            where.id = -1;
        } else {
            where.quoteId = { [Op.in]: quoteIds };
        }
    }
    return where;
};

const getCurrencyTag = async (currencyCode?: string): Promise<string> => {
    if (currencyCode) {
        const symbol = getSymbolFromCurrency(currencyCode);
        return symbol ? symbol : currencyCode;
    }
    return (await settingGet<string>("currency", "$")) ?? "$";
};

const formatAmount = (amount: number, currency: string): string => {
    return `${currency} ${amount.toFixed(2)}`;
};

interface StatRow {
    totalAmount: string | null;
    amount: string | null;
    status: number;
    createdAt: Date | null;
}

interface AggregateResult {
    totalCount: number;
    totalAmount: number;
    successAmount: number;
    failedAmount: number;
    pendingAmount: number;
    rejectedAmount: number;
    amountSum: number;
}

const aggregate = (
    rows: StatRow[],
    options: { todayShape?: boolean } = {},
): AggregateResult => {
    let totalAmount = 0;
    let successAmount = 0;
    let failedAmount = 0;
    let pendingAmount = 0;
    let rejectedAmount = 0;
    let amountSum = 0;
    for (const row of rows) {
        const total = Number(row.totalAmount ?? 0);
        totalAmount += total;
        amountSum += Number(row.amount ?? 0);
        if (row.status === BENEFICIARY_TRANSACTION_COMPLETED) {
            successAmount += total;
        }
        if (FAILED_STATUSES.includes(row.status)) {
            failedAmount += total;
        }
        if (options.todayShape) {
            if (row.status === BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL) {
                pendingAmount += total;
            }
        } else if (PENDING_STATUSES.includes(row.status)) {
            pendingAmount += total;
        }
        if (row.status === BENEFICIARY_TRANSACTION_REJECTED) {
            rejectedAmount += total;
        }
    }
    return {
        totalCount: rows.length,
        totalAmount,
        successAmount,
        failedAmount,
        pendingAmount,
        rejectedAmount,
        amountSum,
    };
};

const countByStatus = (rows: { status: number }[]) => {
    let processing = 0;
    let success = 0;
    let failed = 0;
    for (const row of rows) {
        if (PENDING_STATUSES.includes(row.status)) {
            processing += 1;
        } else if (row.status === BENEFICIARY_TRANSACTION_COMPLETED) {
            success += 1;
        } else if (FAILED_STATUSES.includes(row.status)) {
            failed += 1;
        }
    }
    return {
        total: rows.length,
        initiated: 0,
        processing,
        success,
        failed,
        expired: 0,
        pending: 0,
    };
};

const formatDayLabel = (day: Date): string => {
    const dayNumber = String(day.getDate()).padStart(2, "0");
    const month = day.toLocaleString("en-US", { month: "short" });
    const year = String(day.getFullYear()).slice(-2);
    return `${dayNumber} ${month} ${year}`;
};

export const statistics = async (
    filters: DashboardFilters,
    user: User,
): Promise<Record<string, unknown>> => {
    const scope = await resolveScope(filters, user);
    const quoteIds = await quoteSourceIds(scope);
    const where = buildWhere(user, scope, quoteIds);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const rows = (await BeneficiaryTransaction.findAll({
        where,
        attributes: ["totalAmount", "amount", "status", "createdAt"],
        raw: true,
    })) as unknown as StatRow[];
    const totals = aggregate(rows);
    const todayRows = rows.filter(
        (row) =>
            row.createdAt !== null &&
            new Date(row.createdAt) >= todayStart &&
            new Date(row.createdAt) <= todayEnd,
    );
    const today = aggregate(todayRows, { todayShape: true });

    const currency = await getCurrencyTag(scope.currency);
    return {
        total_transactions: totals.totalCount,
        total_amount: formatAmount(totals.totalAmount, currency),
        total_success_amount: formatAmount(totals.successAmount, currency),
        total_failed_amount: formatAmount(totals.failedAmount, currency),
        total_pending_amount: formatAmount(totals.pendingAmount, currency),
        total_rejected_amount: formatAmount(totals.rejectedAmount, currency),
        today_transactions: today.totalCount,
        today_amount: formatAmount(today.amountSum, currency),
        today_success_amount: formatAmount(today.successAmount, currency),
        today_failed_amount: formatAmount(today.failedAmount, currency),
        today_pending_amount: formatAmount(today.pendingAmount, currency),
        today_rejected_amount: formatAmount(today.rejectedAmount, currency),
    };
};

export const chartsData = async (
    filters: DashboardFilters,
    user: User,
): Promise<Record<string, unknown>> => {
    const scope = await resolveScope(filters, user);
    const quoteIds = await quoteSourceIds(scope);
    const where = buildWhere(user, scope, quoteIds);

    const days = Math.max(1, filters.last_x_days ?? 10);
    const labels: string[] = [];
    const buckets: number[] = [];
    const now = new Date();

    const rows = (await BeneficiaryTransaction.findAll({
        where,
        attributes: ["totalAmount", "status", "createdAt"],
        raw: true,
    })) as unknown as StatRow[];

    for (let offset = days; offset >= 0; offset -= 1) {
        const day = new Date(now);
        day.setDate(now.getDate() - offset);
        const start = new Date(day);
        start.setHours(0, 0, 0, 0);
        const end = new Date(day);
        end.setHours(23, 59, 59, 999);
        const sum = rows
            .filter(
                (row) =>
                    row.createdAt !== null &&
                    new Date(row.createdAt) >= start &&
                    new Date(row.createdAt) <= end,
            )
            .reduce((acc, row) => acc + Number(row.totalAmount ?? 0), 0);
        buckets.push(sum);
        labels.push(formatDayLabel(day));
    }

    const counts = countByStatus(rows);
    return {
        last_x_days_transactions: { model_data: buckets, days: labels },
        statistics: {
            total_transactions: counts.total,
            total_success_count: counts.success,
            total_failed_count: counts.failed,
            total_initiated_count: counts.initiated,
            total_processing_count: counts.processing,
            total_expired_count: counts.expired,
        },
    };
};
