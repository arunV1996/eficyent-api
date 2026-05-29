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
  TRANSACTION_TYPE_CREDIT,
  TRANSACTION_TYPE_DEBIT,
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

    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().ledger.count({ where }),
      prisma().ledger.findMany({
        where,
        include: { wallet: true, virtualAccount: true } as any,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    const enriched = await Promise.all(rows.map(loadTransaction));
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
      include: { wallet: true, virtualAccount: true } as any,
    });
    if (!row) throw new ApiException(149);
    const enriched = await loadTransaction(row as any);
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

    const rows = await prisma().ledger.findMany({
      where,
      include: { wallet: true, virtualAccount: true } as any,
      orderBy: { createdAt: "desc" },
    });

    const { s3Service } = await import("../../services/storage/s3Service");
    let buffer: Buffer;
    let contentType: string;
    let extension: string;
    if (fileType === "excel" || fileType === "xlsx") {
      const exportRows = rows.map((r) => ({
        unique_id: r.uniqueId,
        transaction_type: r.transactionType ?? "",
        transaction_id: r.transactionId ? r.transactionId.toString() : "",
        balance: r.balance.toString(),
        external_type: r.externalType ?? "",
        description: r.description ?? "",
// @ts-expect-error - Auto-fixed: 'r.createdAt' is possibly 'null'.
        created_at: r.createdAt.toISOString(),
      }));
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

      const enriched = await Promise.all(rows.map(loadTransaction));
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
      try {
        const logoPath = path.join(__dirname, "..", "..", "..", "public", "logo", "eficyent-logo-dark.png");
        const logoBuffer = await fs.promises.readFile(logoPath);
        logoUrl = `data:image/png;base64,${logoBuffer.toString("base64")}`;
      } catch (err) {
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
        include: { beneficiaryAccount: true },
      });
      return Object.assign(ledger, { transaction: t });
    }
    case MORPH_WALLET_TRANSACTION: {
      const t = await prisma().walletTransaction.findUnique({
        where: { id: ledger.transactionId },
        include: { quote: true, wallet: true },
      });
      return Object.assign(ledger, { transaction: t });
    }
    default:
      return ledger;
  }
}
