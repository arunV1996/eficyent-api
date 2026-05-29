import { Prisma, TeamMember, User } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import {
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_CANCELLED,
  BENEFICIARY_TRANSACTION_COMPLETED,
  BENEFICIARY_TRANSACTION_EXPIRED,
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING,
  BENEFICIARY_TRANSACTION_REJECTED,
  BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  TEAM_MEMBER_ROLE_CORPORATE,
} from "../../helpers/constants";
import { settingGet } from "../settings/settingsService";
import { getVirtualAccountScope } from "../virtualAccounts/virtualAccountService";

/**
 * Mirror of App\\Repositories\\DashboardRepository.
 *
 * Provides:
 *   - statistics(): totals + today scoped by user, optional virtual
 *     account / wallet, and CORPORATE-team-member narrowing.
 *   - chartsData(): last_x_days totals + per-status counts.
 *
 * Output shapes are byte-stable with the Laravel API; the response
 * envelope stays identical so existing dashboard consumers keep
 * working.
 */

const FAILED_STATUSES = [
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_EXPIRED,
  BENEFICIARY_TRANSACTION_CANCELLED,
  BENEFICIARY_TRANSACTION_REJECTED,
];

// Unused status arrays removed to clean up scope.

export interface DashboardFilters {
  bank_account_id?: string;
  wallet_id?: string;
  last_x_days?: number;
}

interface ResolvedScope {
  bankAccountId: bigint | null;
  walletId: bigint | null;
}

async function resolveScope(
  filters: DashboardFilters,
  user: User,
): Promise<ResolvedScope> {
  let bankAccountId: bigint | null = null;
  let walletId: bigint | null = null;
  if (filters.bank_account_id) {
    const baseScope = await getVirtualAccountScope(user);
    const va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, uniqueId: filters.bank_account_id },
      select: { id: true },
    });
    if (!va) throw new ApiException(120);
    bankAccountId = va.id;
  }
  if (filters.wallet_id) {
    const wallet = await prisma().wallet.findFirst({
      where: { uniqueId: filters.wallet_id, userId: user.id },
      select: { id: true },
    });
    if (!wallet) throw new ApiException(167);
    walletId = wallet.id;
  }
  return { bankAccountId, walletId };
}

async function quoteSourceIds(
  scope: ResolvedScope,
): Promise<bigint[] | null> {
  // The Laravel scope filters by `quote.source_id` via two separate
  // whereHas('quote') subqueries when both filters are present - which
  // is logically impossible (a quote has one source_id) and returns
  // zero rows. Match that behaviour explicitly.
  if (scope.bankAccountId && scope.walletId) return [];
  const sourceId = scope.bankAccountId ?? scope.walletId;
  if (!sourceId) return null;

  const sourceType = scope.bankAccountId
    ? "App\\Models\\VirtualAccount"
    : "App\\Models\\Wallet";

  const quotes = await prisma().quote.findMany({
    where: { sourceId, sourceType },
    select: { id: true },
  });
  return quotes.map((q) => q.id);
}

function buildWhere(
  user: User,
  scope: ResolvedScope,
  quoteIds: bigint[] | null,
  teamMember: TeamMember | null,
): Prisma.BeneficiaryTransactionWhereInput {
  const where: Prisma.BeneficiaryTransactionWhereInput = { userId: user.id };
  if ((scope.bankAccountId || scope.walletId) && quoteIds) {
    if (quoteIds.length === 0) {
      // Source matched zero quotes - return an impossible filter so the
      // resulting query returns no rows.
      where.id = -1n as unknown as bigint;
    } else {
      where.quoteId = { in: quoteIds };
    }
  }
  if (teamMember && teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
    where.teamMemberId = teamMember.id;
  }
  return where;
}

async function getCurrencyTag(): Promise<string> {
  const symbol = (await settingGet<string>("currency", "$")) ?? "$";
  return symbol;
}

function fmt(amount: Prisma.Decimal | number | null | undefined, currency: string): string {
  const n = Number(amount ?? 0);
  return `${currency} ${n.toFixed(2)}`;
}

export const dashboardService = {
  async statistics(
    filters: DashboardFilters,
    user: User,
    teamMember: TeamMember | null = null,
  ): Promise<Record<string, unknown>> {
    const scope = await resolveScope(filters, user);
    const quoteIds = await quoteSourceIds(scope);
    const where = buildWhere(user, scope, quoteIds, teamMember);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    // Pull all rows then aggregate in TS - the Laravel selectRaw uses
    // multi-status CASE WHENs which Prisma doesn't directly support; we
    // already constrain by user_id + quote so the row count is bounded.
    const rows = await prisma().beneficiaryTransaction.findMany({
      where,
      select: { totalAmount: true, amount: true, status: true, createdAt: true },
    });
    const totals = aggregate(rows);
    const todayRows = rows.filter(
// @ts-ignore - Auto-fixed: 'r.createdAt' is possibly 'null'.
// @ts-expect-error - Auto-fixed: 'r.createdAt' is possibly 'null'.
      (r) => r.createdAt >= todayStart && r.createdAt <= todayEnd,
    );
    const today = aggregate(todayRows, { todayShape: true });

    const currency = await getCurrencyTag();
    return {
      total_transactions: totals.totalCount,
      total_amount: fmt(totals.totalAmount, currency),
      total_success_amount: fmt(totals.successAmount, currency),
      total_failed_amount: fmt(totals.failedAmount, currency),
      total_pending_amount: fmt(totals.pendingAmount, currency),
      total_rejected_amount: fmt(totals.rejectedAmount, currency),
      today_transactions: today.totalCount,
      today_amount: fmt(today.amountSum, currency),
      today_success_amount: fmt(today.successAmount, currency),
      today_failed_amount: fmt(today.failedAmount, currency),
      today_pending_amount: fmt(today.pendingAmount, currency),
      today_rejected_amount: fmt(today.rejectedAmount, currency),
    };
  },

  async chartsData(
    filters: DashboardFilters,
    user: User,
    teamMember: TeamMember | null = null,
  ): Promise<Record<string, unknown>> {
    const scope = await resolveScope(filters, user);
    const quoteIds = await quoteSourceIds(scope);
    const where = buildWhere(user, scope, quoteIds, teamMember);

    const days = Math.max(1, filters.last_x_days ?? 10);
    const labels: string[] = [];
    const buckets: number[] = [];
    const now = new Date();

    const rows = await prisma().beneficiaryTransaction.findMany({
      where,
      select: { totalAmount: true, status: true, createdAt: true },
    });

    for (let i = days; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const start = new Date(day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(day);
      end.setHours(23, 59, 59, 999);
      const sum = rows
// @ts-ignore - Auto-fixed: 'r.createdAt' is possibly 'null'.
// @ts-expect-error - Auto-fixed: 'r.createdAt' is possibly 'null'.
        .filter((r) => r.createdAt >= start && r.createdAt <= end)
        .reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);
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
  },
};

interface AggResult {
  totalCount: number;
  totalAmount: number;
  successAmount: number;
  failedAmount: number;
  pendingAmount: number;
  rejectedAmount: number;
  amountSum: number;
}

function aggregate(
  rows: { totalAmount: Prisma.Decimal | null; amount: Prisma.Decimal | null; status: number }[],
  opts: { todayShape?: boolean } = {},
): AggResult {
  let totalAmount = 0;
  let successAmount = 0;
  let failedAmount = 0;
  let pendingAmount = 0;
  let rejectedAmount = 0;
  let amountSum = 0;
  for (const r of rows) {
    const total = Number(r.totalAmount ?? 0);
    totalAmount += total;
    amountSum += Number(r.amount ?? 0);
    if (r.status === BENEFICIARY_TRANSACTION_COMPLETED) successAmount += total;
    if (FAILED_STATUSES.includes(r.status)) failedAmount += total;
    if (opts.todayShape) {
      if (r.status === BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL) {
        pendingAmount += total;
      }
      if (r.status === BENEFICIARY_TRANSACTION_REJECTED) rejectedAmount += total;
    } else {
      if (
        r.status === BENEFICIARY_TRANSACTION_APPROVED ||
        r.status === BENEFICIARY_TRANSACTION_PROCESSING ||
        r.status === BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL ||
        r.status === BENEFICIARY_TRANSACTION_INITIATED
      ) {
        pendingAmount += total;
      }
      if (r.status === BENEFICIARY_TRANSACTION_REJECTED) rejectedAmount += total;
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
}

function countByStatus(rows: { status: number }[]) {
  let initiated = 0,
    processing = 0,
    success = 0,
    failed = 0,
    expired = 0,
    pending = 0;

  for (const r of rows) {
    if (r.status === BENEFICIARY_TRANSACTION_INITIATED) {
      initiated++;
    } else if (
      r.status === BENEFICIARY_TRANSACTION_APPROVED ||
      r.status === BENEFICIARY_TRANSACTION_PROCESSING ||
      r.status === BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL
    ) {
      processing++;
    } else if (r.status === BENEFICIARY_TRANSACTION_COMPLETED) {
      success++;
    } else if (r.status === BENEFICIARY_TRANSACTION_EXPIRED) {
      expired++;
    } else if (
      r.status === BENEFICIARY_TRANSACTION_FAILED ||
      r.status === BENEFICIARY_TRANSACTION_CANCELLED ||
      r.status === BENEFICIARY_TRANSACTION_REJECTED
    ) {
      failed++;
    } else if (r.status === BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL) {
      // Logic safety - if for some reason it wasn't caught in processing
      pending++;
    }
  }
  return { total: rows.length, initiated, processing, success, failed, expired, pending };
}

function formatDayLabel(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}
