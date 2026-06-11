import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import ejs from "ejs";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import {
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_DEPOSIT_TRANSACTION,
  MORPH_WALLET_TRANSACTION,
  TAKE_COUNT,
  TEAM_MEMBER_ROLE_CORPORATE,
  TRANSACTION_TYPE_CREDIT,
  TRANSACTION_TYPE_DEBIT,
  MORPH_VIRTUAL_ACCOUNT,
  MORPH_WALLET,
} from "../../helpers/constants";
import { ledgerResource } from "../../services/ledgers/ledgerResource";
import {
  LedgerListInput,
  LedgerShowInput,
} from "../../validators/ledgers/ledgerValidators";
import {
  getVirtualAccountScope,
} from "../../services/virtualAccounts/virtualAccountService";

/**
 * Mirror of Api\\LedgerController + LedgerRepository.
 *
 * The polymorphic transaction_type column maps to:
 *   TRANSACTION_TYPE_CREDIT -> App\\Models\\DepositTransaction
 *   TRANSACTION_TYPE_DEBIT  -> App\\Models\\BeneficiaryTransaction
 *
 * Phase 5 also recognises App\\Models\\WalletTransaction (written by Phase 4
 * wallet/convert) and includes those rows when no transaction_type filter
 * is supplied.
 */

export const ledgerController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as LedgerListInput;

    const where: Prisma.LedgerWhereInput = { userId: req.user.id };

    if (q.bank_account_id) {
      const baseScope = await getVirtualAccountScope(req.user);
      const va = await prisma().virtualAccount.findFirst({
        where: { ...baseScope, uniqueId: q.bank_account_id },
      });
      if (va) where.virtualAccountId = va.id;
      else where.id = -1n; // mirror Laravel `whereRaw('1 = 0')`
    }
    if (q.wallet_id) {
      const wallet = await prisma().wallet.findFirst({
        where: { uniqueId: q.wallet_id, userId: req.user.id },
      });
      if (wallet) where.walletId = wallet.id;
      else where.id = -1n;
    }
    if (q.from_date && q.to_date) {
      where.createdAt = {
        gte: new Date(`${q.from_date}T00:00:00Z`),
        lte: new Date(`${q.to_date}T23:59:59Z`),
      };
    }
    if (q.transaction_type === TRANSACTION_TYPE_CREDIT) {
      where.transactionType = MORPH_DEPOSIT_TRANSACTION;
    } else if (q.transaction_type === TRANSACTION_TYPE_DEBIT) {
      where.transactionType = MORPH_BENEFICIARY_TRANSACTION;
    }

    let allowedTxns: {
      depIds: bigint[];
      benIds: bigint[];
      wtIds: bigint[];
      filterApplied: boolean;
    } = { depIds: [], benIds: [], wtIds: [], filterApplied: false };

    if (q.receiving_currency) {
      allowedTxns.filterApplied = true;
      const [depRows, benRows, wtRows] = await Promise.all([
        prisma().depositTransaction.findMany({
          where: { userId: req.user.id, depositCurrency: q.receiving_currency },
          select: { id: true },
        }),
        prisma().beneficiaryTransaction.findMany({
          where: { userId: req.user.id, receivingCurrency: q.receiving_currency },
          select: { id: true },
        }),
        prisma().walletTransaction.findMany({
          where: { userId: req.user.id, quote: { receivingCurrency: q.receiving_currency } },
          select: { id: true },
        }),
      ]);
      allowedTxns.depIds = depRows.map((r) => r.id);
      allowedTxns.benIds = benRows.map((r) => r.id);
      allowedTxns.wtIds = wtRows.map((r) => r.id);
    }

    if (q.search_key) {
      const k = q.search_key;
      const depSearchWhere: Prisma.DepositTransactionWhereInput = {
        uniqueId: { contains: k },
        userId: req.user.id,
      };
      if (allowedTxns.filterApplied) {
        depSearchWhere.id = { in: allowedTxns.depIds };
      }
      const benSearchWhere: Prisma.BeneficiaryTransactionWhereInput = {
        uniqueId: { contains: k },
        userId: req.user.id,
      };
      if (allowedTxns.filterApplied) {
        benSearchWhere.id = { in: allowedTxns.benIds };
      }
      const wtSearchWhere: Prisma.WalletTransactionWhereInput = {
        uniqueId: { contains: k },
        userId: req.user.id,
      };
      if (allowedTxns.filterApplied) {
        wtSearchWhere.id = { in: allowedTxns.wtIds };
      }

      const [depIds, benIds, wtIds] = await Promise.all([
        prisma().depositTransaction.findMany({
          where: depSearchWhere,
          select: { id: true },
        }),
        prisma().beneficiaryTransaction.findMany({
          where: benSearchWhere,
          select: { id: true },
        }),
        prisma().walletTransaction.findMany({
          where: wtSearchWhere,
          select: { id: true },
        }),
      ]);

      where.OR = [
        { uniqueId: { contains: k } },
        ...(depIds.length > 0
          ? [{
              transactionType: MORPH_DEPOSIT_TRANSACTION,
              transactionId: { in: depIds.map((r) => r.id) },
            } satisfies Prisma.LedgerWhereInput]
          : []),
        ...(benIds.length > 0
          ? [{
              transactionType: MORPH_BENEFICIARY_TRANSACTION,
              transactionId: { in: benIds.map((r) => r.id) },
            } satisfies Prisma.LedgerWhereInput]
          : []),
        ...(wtIds.length > 0
          ? [{
              transactionType: MORPH_WALLET_TRANSACTION,
              transactionId: { in: wtIds.map((r) => r.id) },
            } satisfies Prisma.LedgerWhereInput]
          : []),
      ];
    } else if (allowedTxns.filterApplied) {
      where.OR = [
        {
          transactionType: MORPH_DEPOSIT_TRANSACTION,
          transactionId: { in: allowedTxns.depIds },
        },
        {
          transactionType: MORPH_BENEFICIARY_TRANSACTION,
          transactionId: { in: allowedTxns.benIds },
        },
        {
          transactionType: MORPH_WALLET_TRANSACTION,
          transactionId: { in: allowedTxns.wtIds },
        },
      ];
    }

    if (req.teamMember && req.teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
      // Resolve the source VA/wallet from the filters so the corporate scope
      // ID lists are consistent with the root where.virtualAccountId/walletId.
      let corporateVaId: bigint | undefined;
      let corporateWalletId: bigint | undefined;
      if (q.bank_account_id) {
        const baseScope = await getVirtualAccountScope(req.user);
        const va = await prisma().virtualAccount.findFirst({
          where: { ...baseScope, uniqueId: q.bank_account_id },
        });
        if (va) corporateVaId = va.id;
      }
      if (q.wallet_id) {
        const wallet = await prisma().wallet.findFirst({
          where: { uniqueId: q.wallet_id, userId: req.user.id },
        });
        if (wallet) corporateWalletId = wallet.id;
      }

      // Deposits scoped to the filtered VA/wallet + team member.
      // Payouts: ALL team member payouts regardless of source — corporate users
      // on DEAL_BASED model pay via an INR wallet whose ledger rows carry
      // walletId, not the USD virtualAccountId, so a source filter here would
      // silently exclude all debit entries.
      const [depIds, benIds] = await Promise.all([
        prisma().depositTransaction.findMany({
          where: {
            userId: req.user.id,
            teamMemberId: req.teamMember.id,
            ...(corporateVaId ? { virtualAccountId: corporateVaId } : {}),
            ...(corporateWalletId ? { walletId: corporateWalletId } : {}),
          },
          select: { id: true },
        }),
        prisma().beneficiaryTransaction.findMany({
          where: { userId: req.user.id, teamMemberId: req.teamMember.id },
          select: { id: true },
        }),
      ]);
      const depIdList = depIds.map((r) => r.id);
      const benIdList = benIds.map((r) => r.id);

      // Remove the root VA/wallet filter — it only makes sense for deposits.
      // Embed it inside the deposit arm of corporateWhere instead.
      if (corporateVaId) delete (where as any).virtualAccountId;
      if (corporateWalletId) delete (where as any).walletId;

      const corporateWhere: Prisma.LedgerWhereInput = {
        OR: [
          {
            transactionType: MORPH_DEPOSIT_TRANSACTION,
            transactionId: { in: depIdList },
            ...(corporateVaId ? { virtualAccountId: corporateVaId } : {}),
            ...(corporateWalletId ? { walletId: corporateWalletId } : {}),
          },
          // Payout entries have their own virtualAccountId/walletId from the
          // quote source — do NOT add a source filter here.
          {
            transactionType: MORPH_BENEFICIARY_TRANSACTION,
            transactionId: { in: benIdList },
          },
        ],
      };

      if (where.AND) {
        if (Array.isArray(where.AND)) {
          where.AND.push(corporateWhere);
        } else {
          where.AND = [where.AND as any, corporateWhere];
        }
      } else {
        where.AND = [corporateWhere];
      }
    }

    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().ledger.count({ where }),
      prisma().ledger.findMany({
        where,
        include: { wallet: true, virtualAccount: true, users: { select: { timezone: true } } } as any,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    const enriched = await Promise.all(rows.map(loadTransaction));

    if (req.teamMember && req.teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
      let vaId: bigint | null = null;
      let walletId: bigint | null = null;

      if (q.bank_account_id) {
        const baseScope = await getVirtualAccountScope(req.user);
        const va = await prisma().virtualAccount.findFirst({
          where: { ...baseScope, uniqueId: q.bank_account_id },
        });
        if (va) vaId = va.id;
      }
      if (q.wallet_id) {
        const wallet = await prisma().wallet.findFirst({
          where: { uniqueId: q.wallet_id, userId: req.user.id },
        });
        if (wallet) walletId = wallet.id;
      }

      const depTransactions = await prisma().depositTransaction.findMany({
        where: {
          userId: req.user.id,
          teamMemberId: req.teamMember.id,
          status: 1, // 1 = COMPLETED
          ...(vaId ? { virtualAccountId: vaId } : {}),
          ...(walletId ? { walletId: walletId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, totalAmount: true, createdAt: true }
      });
      // All payouts by this corporate team member (no source filter) so that
      // wallet-sourced payouts are included in the running-balance timeline.
      const benTransactions = await prisma().beneficiaryTransaction.findMany({
        where: { userId: req.user.id, teamMemberId: req.teamMember.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, totalAmount: true, createdAt: true }
      });

      const timeline: { id: bigint; type: string; amount: number; createdAt: Date }[] = [];
      for (const d of depTransactions) {
        timeline.push({ id: d.id, type: MORPH_DEPOSIT_TRANSACTION, amount: Number(d.totalAmount), createdAt: d.createdAt! });
      }
      for (const b of benTransactions) {
        timeline.push({ id: b.id, type: MORPH_BENEFICIARY_TRANSACTION, amount: -Number(b.totalAmount), createdAt: b.createdAt! });
      }
      timeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id - b.id));

      let running = 0;
      const corporateBalancesMap = new Map<string, string>();
      for (const item of timeline) {
        running += item.amount;
        corporateBalancesMap.set(`${item.type}_${item.id}`, running.toFixed(2));
      }

      for (const l of enriched as any) {
        const key = `${l.transactionType}_${l.transactionId}`;
        if (corporateBalancesMap.has(key)) {
          l.balance = new Prisma.Decimal(corporateBalancesMap.get(key)!);
        } else {
          l.balance = new Prisma.Decimal(0);
        }
      }
    }

    // Non-corporate users: recompute the running balance dynamically when a
    // specific bank account or wallet is selected. The stored ledger.balance
    // snapshot can be stale for wallet-conversion DEBIT entries because it is
    // computed via computeBankBalance which deducts all pending submitted-quote
    // payouts at the moment the entry is written — producing balances that
    // appear inconsistently lower than simple credit-minus-debit arithmetic.
    if (!req.teamMember && (q.bank_account_id || q.wallet_id)) {
      let nonCorpVaId: bigint | null = null;
      let nonCorpWalletId: bigint | null = null;

      if (q.bank_account_id) {
        const baseScope = await getVirtualAccountScope(req.user);
        const va = await prisma().virtualAccount.findFirst({
          where: { ...baseScope, uniqueId: q.bank_account_id },
        });
        if (va) nonCorpVaId = va.id;
      }
      if (q.wallet_id) {
        const wallet = await prisma().wallet.findFirst({
          where: { uniqueId: q.wallet_id, userId: req.user.id },
        });
        if (wallet) nonCorpWalletId = wallet.id;
      }

      // Completed deposits for this VA/wallet.
      const ncDepTxns = await prisma().depositTransaction.findMany({
        where: {
          userId: req.user.id,
          status: 1,
          ...(nonCorpVaId ? { virtualAccountId: nonCorpVaId } : {}),
          ...(nonCorpWalletId ? { walletId: nonCorpWalletId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, totalAmount: true, createdAt: true },
      });

      // Wallet-conversion DEBIT transactions sourced from this VA.
      // These are the entries whose stored balance is wrong.
      const ncWalletTxns = nonCorpVaId
        ? await prisma().walletTransaction.findMany({
            where: {
              userId: req.user.id,
              type: TRANSACTION_TYPE_DEBIT,
              quote: { sourceType: MORPH_VIRTUAL_ACCOUNT, sourceId: nonCorpVaId },
            },
            orderBy: { createdAt: "asc" },
            select: { id: true, createdAt: true, quote: { select: { totalSendingAmount: true } } },
          } as any)
        : [];

      // Beneficiary payouts sourced from this VA/wallet.
      const ncBenTxns = await prisma().beneficiaryTransaction.findMany({
        where: {
          userId: req.user.id,
          ...(nonCorpVaId
            ? { quotes: { sourceType: MORPH_VIRTUAL_ACCOUNT, sourceId: nonCorpVaId } }
            : {}),
          ...(nonCorpWalletId
            ? { quotes: { sourceType: MORPH_WALLET, sourceId: nonCorpWalletId } }
            : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, totalAmount: true, createdAt: true },
      });

      const ncTimeline: { id: bigint; type: string; amount: number; createdAt: Date }[] = [];
      for (const d of ncDepTxns) {
        ncTimeline.push({ id: d.id, type: MORPH_DEPOSIT_TRANSACTION, amount: Number(d.totalAmount), createdAt: d.createdAt! });
      }
      for (const w of ncWalletTxns as any[]) {
        const amt = Number(w.quote?.totalSendingAmount ?? 0);
        ncTimeline.push({ id: w.id, type: MORPH_WALLET_TRANSACTION, amount: -amt, createdAt: w.createdAt! });
      }
      for (const b of ncBenTxns) {
        ncTimeline.push({ id: b.id, type: MORPH_BENEFICIARY_TRANSACTION, amount: -Number(b.totalAmount), createdAt: b.createdAt! });
      }
      ncTimeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id - b.id));

      let ncRunning = 0;
      const ncBalancesMap = new Map<string, string>();
      for (const item of ncTimeline) {
        ncRunning += item.amount;
        ncBalancesMap.set(`${item.type}_${item.id}`, ncRunning.toFixed(2));
      }

      for (const l of enriched as any) {
        const key = `${l.transactionType}_${l.transactionId}`;
        if (ncBalancesMap.has(key)) {
          l.balance = new Prisma.Decimal(ncBalancesMap.get(key)!);
        }
        // If the key is not found (e.g. wallet CREDIT tx from a different source),
        // leave the stored balance intact.
      }
    }

    return sendResponse(res, "", "", {
      total,
      receiving_currency: q.receiving_currency || null,
      ledgers: enriched.map((l: any) => ledgerResource(l, q)),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as LedgerShowInput;
    const row = await prisma().ledger.findFirst({
      where: { userId: req.user.id, uniqueId: q.ledger_id },
      include: { wallet: true, virtualAccount: true, users: { select: { timezone: true } } } as any,
    });
    if (!row) throw new ApiException(149);
    const enriched = await loadTransaction(row as any);

    if (req.teamMember && req.teamMember.role === TEAM_MEMBER_ROLE_CORPORATE && row) {
      const depAgg = await prisma().depositTransaction.aggregate({
        where: {
          userId: req.user.id,
          teamMemberId: req.teamMember.id,
          status: 1, // 1 = COMPLETED
          createdAt: { lte: row.createdAt! },
          ...(row.virtualAccountId ? { virtualAccountId: row.virtualAccountId } : {}),
          ...(row.walletId ? { walletId: row.walletId } : {}),
        },
        _sum: { totalAmount: true },
      });
      const benAgg = await prisma().beneficiaryTransaction.aggregate({
        where: {
          userId: req.user.id,
          teamMemberId: req.teamMember.id,
          createdAt: { lte: row.createdAt! },
          ...(row.virtualAccountId ? { quotes: { sourceType: MORPH_VIRTUAL_ACCOUNT, sourceId: row.virtualAccountId } } : {}),
          ...(row.walletId ? { quotes: { sourceType: MORPH_WALLET, sourceId: row.walletId } } : {}),
        },
        _sum: { totalAmount: true },
      });
      const depSum = depAgg._sum.totalAmount ?? new Prisma.Decimal(0);
      const benSum = benAgg._sum.totalAmount ?? new Prisma.Decimal(0);
      (enriched as any).balance = depSum.minus(benSum);
    }

    return sendResponse(res, "", "", { ledger: ledgerResource(enriched as any, q as any) });
  },

  async export(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as LedgerListInput;
    const fileType = String((req.query as { type?: string }).type ?? "pdf").toLowerCase();

    const where: Prisma.LedgerWhereInput = { userId: req.user.id };
    if (q.from_date && q.to_date) {
      where.createdAt = {
        gte: new Date(`${q.from_date}T00:00:00Z`),
        lte: new Date(`${q.to_date}T23:59:59Z`),
      };
    }
    if (q.bank_account_id) {
      const baseScope = await getVirtualAccountScope(req.user);
      const va = await prisma().virtualAccount.findFirst({
        where: { ...baseScope, uniqueId: q.bank_account_id },
      });
      if (va) where.virtualAccountId = va.id;
    }
    if (q.wallet_id) {
      const wallet = await prisma().wallet.findFirst({
        where: { uniqueId: q.wallet_id, userId: req.user.id },
      });
      if (wallet) where.walletId = wallet.id;
    }

    let allowedTxns: {
      depIds: bigint[];
      benIds: bigint[];
      wtIds: bigint[];
      filterApplied: boolean;
    } = { depIds: [], benIds: [], wtIds: [], filterApplied: false };

    if (q.receiving_currency) {
      allowedTxns.filterApplied = true;
      const [depRows, benRows, wtRows] = await Promise.all([
        prisma().depositTransaction.findMany({
          where: { userId: req.user.id, depositCurrency: q.receiving_currency },
          select: { id: true },
        }),
        prisma().beneficiaryTransaction.findMany({
          where: { userId: req.user.id, receivingCurrency: q.receiving_currency },
          select: { id: true },
        }),
        prisma().walletTransaction.findMany({
          where: { userId: req.user.id, quote: { receivingCurrency: q.receiving_currency } },
          select: { id: true },
        }),
      ]);
      allowedTxns.depIds = depRows.map((r) => r.id);
      allowedTxns.benIds = benRows.map((r) => r.id);
      allowedTxns.wtIds = wtRows.map((r) => r.id);
    }

    if (q.search_key) {
      const k = q.search_key;
      const depSearchWhere: Prisma.DepositTransactionWhereInput = {
        uniqueId: { contains: k },
        userId: req.user.id,
      };
      if (allowedTxns.filterApplied) {
        depSearchWhere.id = { in: allowedTxns.depIds };
      }
      const benSearchWhere: Prisma.BeneficiaryTransactionWhereInput = {
        uniqueId: { contains: k },
        userId: req.user.id,
      };
      if (allowedTxns.filterApplied) {
        benSearchWhere.id = { in: allowedTxns.benIds };
      }
      const wtSearchWhere: Prisma.WalletTransactionWhereInput = {
        uniqueId: { contains: k },
        userId: req.user.id,
      };
      if (allowedTxns.filterApplied) {
        wtSearchWhere.id = { in: allowedTxns.wtIds };
      }

      const [depIds, benIds, wtIds] = await Promise.all([
        prisma().depositTransaction.findMany({
          where: depSearchWhere,
          select: { id: true },
        }),
        prisma().beneficiaryTransaction.findMany({
          where: benSearchWhere,
          select: { id: true },
        }),
        prisma().walletTransaction.findMany({
          where: wtSearchWhere,
          select: { id: true },
        }),
      ]);

      where.OR = [
        { uniqueId: { contains: k } },
        ...(depIds.length > 0
          ? [{
              transactionType: MORPH_DEPOSIT_TRANSACTION,
              transactionId: { in: depIds.map((r) => r.id) },
            } satisfies Prisma.LedgerWhereInput]
          : []),
        ...(benIds.length > 0
          ? [{
              transactionType: MORPH_BENEFICIARY_TRANSACTION,
              transactionId: { in: benIds.map((r) => r.id) },
            } satisfies Prisma.LedgerWhereInput]
          : []),
        ...(wtIds.length > 0
          ? [{
              transactionType: MORPH_WALLET_TRANSACTION,
              transactionId: { in: wtIds.map((r) => r.id) },
            } satisfies Prisma.LedgerWhereInput]
          : []),
      ];
    } else if (allowedTxns.filterApplied) {
      where.OR = [
        {
          transactionType: MORPH_DEPOSIT_TRANSACTION,
          transactionId: { in: allowedTxns.depIds },
        },
        {
          transactionType: MORPH_BENEFICIARY_TRANSACTION,
          transactionId: { in: allowedTxns.benIds },
        },
        {
          transactionType: MORPH_WALLET_TRANSACTION,
          transactionId: { in: allowedTxns.wtIds },
        },
      ];
    }

    if (req.teamMember && req.teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
      // Resolve the source VA/wallet from the filters so the corporate scope
      // ID lists are consistent with the root where.virtualAccountId/walletId.
      let corporateVaId: bigint | undefined;
      let corporateWalletId: bigint | undefined;
      if (q.bank_account_id) {
        const baseScope = await getVirtualAccountScope(req.user);
        const va = await prisma().virtualAccount.findFirst({
          where: { ...baseScope, uniqueId: q.bank_account_id },
        });
        if (va) corporateVaId = va.id;
      }
      if (q.wallet_id) {
        const wallet = await prisma().wallet.findFirst({
          where: { uniqueId: q.wallet_id, userId: req.user.id },
        });
        if (wallet) corporateWalletId = wallet.id;
      }

      const [depIds, benIds] = await Promise.all([
        prisma().depositTransaction.findMany({
          where: {
            userId: req.user.id,
            teamMemberId: req.teamMember.id,
            ...(corporateVaId ? { virtualAccountId: corporateVaId } : {}),
            ...(corporateWalletId ? { walletId: corporateWalletId } : {}),
          },
          select: { id: true },
        }),
        // All team member payouts — no source filter (same reason as index).
        prisma().beneficiaryTransaction.findMany({
          where: { userId: req.user.id, teamMemberId: req.teamMember.id },
          select: { id: true },
        }),
      ]);
      const depIdList = depIds.map((r) => r.id);
      const benIdList = benIds.map((r) => r.id);

      if (corporateVaId) delete (where as any).virtualAccountId;
      if (corporateWalletId) delete (where as any).walletId;

      const corporateWhere: Prisma.LedgerWhereInput = {
        OR: [
          {
            transactionType: MORPH_DEPOSIT_TRANSACTION,
            transactionId: { in: depIdList },
            ...(corporateVaId ? { virtualAccountId: corporateVaId } : {}),
            ...(corporateWalletId ? { walletId: corporateWalletId } : {}),
          },
          {
            transactionType: MORPH_BENEFICIARY_TRANSACTION,
            transactionId: { in: benIdList },
          },
        ],
      };

      if (where.AND) {
        if (Array.isArray(where.AND)) {
          where.AND.push(corporateWhere);
        } else {
          where.AND = [where.AND as any, corporateWhere];
        }
      } else {
        where.AND = [corporateWhere];
      }
    }

    const rows = await prisma().ledger.findMany({
      where,
      include: { wallet: true, virtualAccount: true, users: { select: { timezone: true } } } as any,
      orderBy: { createdAt: "desc" },
    });

    const { s3Service } = await import("../../services/storage/s3Service");
    let buffer: Buffer;
    let contentType: string;
    let extension: string;

    const enriched = await Promise.all(rows.map(loadTransaction));

    if (req.teamMember && req.teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
      let vaId: bigint | null = null;
      let walletId: bigint | null = null;

      if (q.bank_account_id) {
        const baseScope = await getVirtualAccountScope(req.user);
        const va = await prisma().virtualAccount.findFirst({
          where: { ...baseScope, uniqueId: q.bank_account_id },
        });
        if (va) vaId = va.id;
      }
      if (q.wallet_id) {
        const wallet = await prisma().wallet.findFirst({
          where: { uniqueId: q.wallet_id, userId: req.user.id },
        });
        if (wallet) walletId = wallet.id;
      }

      const depTransactions = await prisma().depositTransaction.findMany({
        where: {
          userId: req.user.id,
          teamMemberId: req.teamMember.id,
          status: 1, // 1 = COMPLETED
          ...(vaId ? { virtualAccountId: vaId } : {}),
          ...(walletId ? { walletId: walletId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, totalAmount: true, createdAt: true }
      });
      const benTransactions = await prisma().beneficiaryTransaction.findMany({
        where: { userId: req.user.id, teamMemberId: req.teamMember.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, totalAmount: true, createdAt: true }
      });

      const timeline: { id: bigint; type: string; amount: number; createdAt: Date }[] = [];
      for (const d of depTransactions) {
        timeline.push({ id: d.id, type: MORPH_DEPOSIT_TRANSACTION, amount: Number(d.totalAmount), createdAt: d.createdAt! });
      }
      for (const b of benTransactions) {
        timeline.push({ id: b.id, type: MORPH_BENEFICIARY_TRANSACTION, amount: -Number(b.totalAmount), createdAt: b.createdAt! });
      }
      timeline.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || Number(a.id - b.id));

      let running = 0;
      const corporateBalancesMap = new Map<string, string>();
      for (const item of timeline) {
        running += item.amount;
        corporateBalancesMap.set(`${item.type}_${item.id}`, running.toFixed(2));
      }

      for (const l of enriched as any) {
        const key = `${l.transactionType}_${l.transactionId}`;
        if (corporateBalancesMap.has(key)) {
          l.balance = new Prisma.Decimal(corporateBalancesMap.get(key)!);
        } else {
          l.balance = new Prisma.Decimal(0);
        }
      }
    }

    if (fileType === "excel" || fileType === "xlsx") {
      const exportRows = enriched.map((l: any, i) => {
        const res = ledgerResource(l, q);
        const row: Record<string, any> = {
          "S.No": i + 1,
          "Transaction ID": res.transaction_id || "",
          "Client Reference No": `'${res.client_reference_id || ""}`,
          "Credit": res.transaction_type === "CREDIT" ? res.amount : "-",
          "Debit": res.transaction_type === "DEBIT" ? res.amount : "-",
        };
        if (!q.receiving_currency) {
          row["Balance"] = res.balance || "";
        }
        row["Date"] = res.created_at || "";
        return row;
      });

      const { generateExcel } = await import("../../services/exports/excelExport");
      buffer = await generateExcel(exportRows, { sheetTitle: "Ledgers" });
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      extension = "xlsx";
    } else {
      let accountDetails: any = null;
      if (q.bank_account_id) {
        const baseScope = await getVirtualAccountScope(req.user);
        const va = await prisma().virtualAccount.findFirst({
          where: { ...baseScope, uniqueId: q.bank_account_id },
        });
        if (va) {
          accountDetails = {
            account_number: va.accountNumber,
            account_holder_name: va.accountHolderName,
            currency: va.currency,
            account_bank_name: va.accountBankName,
            account_bank_code: va.accountBankCode,
            routing_number: va.routingNumber,
            account_bank_address: va.accountBankAddress,
          };
        }
      } else if (q.wallet_id) {
        const wallet = await prisma().wallet.findFirst({
          where: { uniqueId: q.wallet_id, userId: req.user.id },
        });
        if (wallet) {
          accountDetails = {
            account_number: "-",
            account_holder_name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "-",
            currency: wallet.currency,
            account_bank_name: "Eficyent Wallet",
            account_bank_code: "-",
            routing_number: "-",
            account_bank_address: "-",
          };
        }
      }

      const ledgerDetails = enriched.map((l: any) => {
        const res = ledgerResource(l, q);
        return {
          transaction_id: res.transaction_id,
          client_reference_id: res.client_reference_id,
          transaction_type: res.transaction_type,
          amount: res.amount,
          balance: res.balance,
          created_at: res.created_at,
        };
      });

      const translations: Record<string, string> = {
        bank_statement: "Bank Statement",
        account_number: "Account Number",
        account_holder: "Account Holder",
        currency: "Currency",
        receiving_currency: "Receiving Currency",
        account_bank_name: "Bank Name",
        bank_code: "Bank Code",
        routing_number: "Routing Number",
        bank_address: "Bank Address",
        s_no: "S.No",
        transaction_id: "Transaction ID",
        client_ref_no: "Client Ref No",
        credit: "Credit",
        debit: "Debit",
        balance: "Balance",
        date: "Date",
        na: "N/A"
      };
      const tr = (key: string) => translations[key] || key;

      const today = new Date();
      const formattedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

      let logoUrl = "";
      const logoPaths = [
        path.join(__dirname, "..", "..", "..", "public", "logo", "eficyent-logo-dark.png"),
        path.join(__dirname, "..", "..", "public", "logo", "eficyent-logo-dark.png"),
        path.join(process.cwd(), "public", "logo", "eficyent-logo-dark.png"),
        path.join(process.cwd(), "dist", "public", "logo", "eficyent-logo-dark.png"),
      ];
      for (const p of logoPaths) {
        if (fs.existsSync(p)) {
          try {
            const logoBase64 = fs.readFileSync(p).toString("base64");
            logoUrl = `data:image/png;base64,${logoBase64}`;
            break;
          } catch (e) {
            // ignore and try next path
          }
        }
      }
      if (!logoUrl) {
        logoUrl = `${process.env.APP_URL || `http://localhost:${process.env.PORT || 1730}`}/logo/eficyent-logo-dark.png`;
      }

      const templatePath = path.join(__dirname, "..", "..", "views", "invoice", "balanceAndStatements.ejs");
      const templateHtml = await fs.promises.readFile(templatePath, "utf-8");
      const html = ejs.render(templateHtml, {
        tr,
        date: formattedDate,
        logo: logoUrl,
        account_details: accountDetails,
        receiving_currency: q.receiving_currency || null,
        ledger_details: ledgerDetails,
      });

      const browser = await puppeteer.launch({
        headless: "new" as any,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(html);
      const pdfUint8Array = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "30px",
          right: "30px",
          bottom: "30px",
          left: "30px",
        },
      });
      buffer = Buffer.from(pdfUint8Array);
      await browser.close();

      contentType = "application/pdf";
      extension = "pdf";
    }
    const url = await s3Service.upload(
      { buffer, contentType, extension },
      "exports/ledgers",
    );
    const signedUrl = await s3Service.temporaryUrl(url);
    return sendResponse(res, "", 200, { url: signedUrl });
  },
};

async function loadTransaction(
  ledger: Awaited<ReturnType<ReturnType<typeof prisma>["ledger"]["findFirst"]>>,
): Promise<NonNullable<typeof ledger> & { transaction?: unknown; refundLedger?: unknown }> {
  if (!ledger) throw new ApiException(149);
  let refundLedgerEnriched: any = null;
  if (ledger.refundLedgerId) {
    const rl = await prisma().ledger.findUnique({
      where: { id: ledger.refundLedgerId },
    });
    if (rl) {
      refundLedgerEnriched = await loadTransaction(rl as any);
    }
  }
  const enrichedLedger = Object.assign(ledger, { refundLedger: refundLedgerEnriched });

  if (!ledger.transactionType || !ledger.transactionId) return enrichedLedger;
  switch (ledger.transactionType) {
    case MORPH_DEPOSIT_TRANSACTION: {
      const t = await prisma().depositTransaction.findUnique({
        where: { id: ledger.transactionId },
      });
      return Object.assign(enrichedLedger, { transaction: t });
    }
    case MORPH_BENEFICIARY_TRANSACTION: {
      const t = await prisma().beneficiaryTransaction.findUnique({
        where: { id: ledger.transactionId },
        include: { beneficiaryAccount: true },
      });
      return Object.assign(enrichedLedger, { transaction: t });
    }
    case MORPH_WALLET_TRANSACTION: {
      const t = await prisma().walletTransaction.findUnique({
        where: { id: ledger.transactionId },
        include: { quote: true, wallet: true },
      });
      return Object.assign(enrichedLedger, { transaction: t });
    }
    default:
      return enrichedLedger;
  }
}
