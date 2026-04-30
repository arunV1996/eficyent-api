import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import {
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_DEPOSIT_TRANSACTION,
  MORPH_WALLET_TRANSACTION,
  TAKE_COUNT,
  TRANSACTION_TYPE_CREDIT,
  TRANSACTION_TYPE_DEBIT,
} from "../../helpers/constants";
import { ledgerResource } from "../../services/ledgers/ledgerResource";
import {
  LedgerListInput,
  LedgerShowInput,
} from "../../validators/ledgers/ledgerValidators";

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
      const va = await prisma().virtualAccount.findFirst({
        where: { uniqueId: q.bank_account_id, userId: req.user.id },
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
    if (q.search_key) {
      // Mirror of LedgerRepository::list - search on Ledger.unique_id OR
      // the related transaction's unique_id. Prisma doesn't support
      // whereHasMorph; we OR-join on the candidate transaction tables.
      const k = q.search_key;
      const candidateIds = await Promise.all([
        prisma().depositTransaction.findMany({
          where: { uniqueId: { contains: k }, userId: req.user.id },
          select: { id: true },
        }),
        prisma().beneficiaryTransaction.findMany({
          where: { uniqueId: { contains: k }, userId: req.user.id },
          select: { id: true },
        }),
        prisma().walletTransaction.findMany({
          where: { uniqueId: { contains: k }, userId: req.user.id },
          select: { id: true },
        }),
      ]);
      const [depIds, benIds, wtIds] = candidateIds;
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
    }

    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().ledger.count({ where }),
      prisma().ledger.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    const enriched = await Promise.all(rows.map(loadTransaction));
    return sendResponse(res, "", 200, {
      total,
      ledgers: enriched.map(ledgerResource),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as LedgerShowInput;
    const row = await prisma().ledger.findFirst({
      where: { userId: req.user.id, uniqueId: q.ledger_id },
    });
    if (!row) throw new ApiException(149);
    const enriched = await loadTransaction(row);
    return sendResponse(res, "", 200, { ledger: ledgerResource(enriched) });
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
      const va = await prisma().virtualAccount.findFirst({
        where: { uniqueId: q.bank_account_id, userId: req.user.id },
      });
      if (va) where.virtualAccountId = va.id;
    }
    if (q.wallet_id) {
      const wallet = await prisma().wallet.findFirst({
        where: { uniqueId: q.wallet_id, userId: req.user.id },
      });
      if (wallet) where.walletId = wallet.id;
    }

    const rows = await prisma().ledger.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const exportRows = rows.map((r) => ({
      unique_id: r.uniqueId,
      transaction_type: r.transactionType ?? "",
      transaction_id: r.transactionId ? r.transactionId.toString() : "",
      balance: r.balance.toString(),
      external_type: r.externalType ?? "",
      description: r.description ?? "",
      created_at: r.createdAt.toISOString(),
    }));

    const { s3Service } = await import("../../services/storage/s3Service");
    let buffer: Buffer;
    let contentType: string;
    let extension: string;
    if (fileType === "excel" || fileType === "xlsx") {
      const { generateExcel } = await import("../../services/exports/excelExport");
      buffer = await generateExcel(exportRows, { sheetTitle: "Ledgers" });
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      extension = "xlsx";
    } else {
      const { generateBulkTransactionsPdf } = await import(
        "../../services/exports/pdfReceipt"
      );
      buffer = await generateBulkTransactionsPdf(exportRows, "Ledgers");
      contentType = "application/pdf";
      extension = "pdf";
    }
    const url = await s3Service.upload(
      { buffer, contentType, extension },
      "exports/ledgers",
    );
    return sendResponse(res, "", 200, { url });
  },
};

async function loadTransaction(
  ledger: Awaited<ReturnType<ReturnType<typeof prisma>["ledger"]["findFirst"]>>,
): Promise<NonNullable<typeof ledger> & { transaction?: unknown }> {
  if (!ledger) throw new ApiException(149);
  if (!ledger.transactionType || !ledger.transactionId) return ledger;
  switch (ledger.transactionType) {
    case MORPH_DEPOSIT_TRANSACTION: {
      const t = await prisma().depositTransaction.findUnique({
        where: { id: ledger.transactionId },
      });
      return Object.assign(ledger, { transaction: t });
    }
    case MORPH_BENEFICIARY_TRANSACTION: {
      const t = await prisma().beneficiaryTransaction.findUnique({
        where: { id: ledger.transactionId },
      });
      return Object.assign(ledger, { transaction: t });
    }
    case MORPH_WALLET_TRANSACTION: {
      const t = await prisma().walletTransaction.findUnique({
        where: { id: ledger.transactionId },
      });
      return Object.assign(ledger, { transaction: t });
    }
    default:
      return ledger;
  }
}
