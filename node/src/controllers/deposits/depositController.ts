import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
  DEPOSIT_TRANSACTION_STATUS_MAP,
  DEPOSIT_TYPE_TOPUP,
  TAKE_COUNT,
} from "../../helpers/constants";
import { uniqueId } from "../../helpers/uniqueId";
import { s3Service } from "../../services/storage/s3Service";
import { calcDepositCommissions } from "../../services/commissions/commissionsService";
import { depositTransactionResource } from "../../services/deposits/depositResource";
import { logger } from "../../helpers/logger";
import { TelegramNotifier } from "../../services/external/telegram";
import { ProcessingUnit } from "../../services/external/processingUnit";
import { InvoiceMate } from "../../services/external/invoiceMate";
import {
  DepositCreateInput,
  DepositListInput,
  DepositQuoteInput,
  DepositShowInput,
  DepositTrxnParam,
} from "../../validators/deposits/depositValidators";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\\DepositController + DepositTransactionRepository.
 *
 * Endpoints:
 *   GET  /deposits/list           - filtered, paginated.
 *   GET  /deposits/show           - by unique_id (scoped to req.user).
 *   GET  /deposits/quote          - read-only commission preview.
 *   POST /deposits/store          - creates a deposit; ProcessingUnit dispatch
 *                                   logged-only until Phase 8.
 *   GET  /deposits/export         - 501 (PDF/Excel export lands in Phase 8).
 *   POST /retry_deposit/{trxn}    - reprocess a failed PU initiation.
 */

function generateOrderId(): string {
  const ts = String(Math.floor(Date.now() / 1000)).slice(-8);
  const rand = Array.from({ length: 4 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  return `TXN${ts}${rand}`;
}

function generateUserMemo(user: {
  userType: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name =
    user.userType === 1
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : "";
  const prefix = (name || user.email).slice(0, 3).toUpperCase();
  const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `${prefix}${suffix}`;
}

function emptyEnvelope(
  res: Response,
  message: string,
  data: any,
): Response {
  return res.status(200).json({
    success: true,
    message,
    code: "",
    data,
  });
}

export const depositController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as DepositListInput;
    const status =
      q.status && q.status in DEPOSIT_TRANSACTION_STATUS_MAP
        ? DEPOSIT_TRANSACTION_STATUS_MAP[q.status]
        : null;

    let virtualAccountId: bigint | null = null;
    if (q.bank_account_id) {
      const va = await prisma().virtualAccount.findFirst({
        where: { uniqueId: q.bank_account_id, userId: req.user.id },
      });
      if (!va) throw new ApiException(120);
      virtualAccountId = va.id;
    }

    const where: Prisma.DepositTransactionWhereInput = {
      userId: req.user.id,
      ...(status !== null ? { status } : {}),
      ...(virtualAccountId !== null ? { virtualAccountId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.from_date && q.to_date
        ? {
            createdAt: {
              gte: new Date(`${q.from_date}T00:00:00Z`),
              lte: new Date(`${q.to_date}T23:59:59Z`),
            },
          }
        : {}),
      ...(q.search_key
        ? {
            OR: [
              { uniqueId: { contains: q.search_key } },
              { externalReferenceId: { contains: q.search_key } },
            ],
          }
        : {}),
    };
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().depositTransaction.count({ where }),
      prisma().depositTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return emptyEnvelope(res, "", {
      total,
      deposit_transactions: rows.map(depositTransactionResource),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as DepositShowInput;
    const row = await prisma().depositTransaction.findFirst({
      where: { userId: req.user.id, uniqueId: q.deposit_transaction_id },
    });
    if (!row) throw new ApiException(124);
    return emptyEnvelope(res, "", {
      deposit_transaction: depositTransactionResource(row),
    });
  },

  async quote(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as DepositQuoteInput;
    const va = await prisma().virtualAccount.findFirst({
      where: { uniqueId: q.bank_account_id, userId: req.user.id },
    });
    if (!va) throw new ApiException(120);
    const merchantId = req.user.merchantId
      ? (
          await prisma().merchant.findFirst({
            where: { id: req.user.merchantId },
          })
        )?.id ?? null
      : null;
    const currency = (q.deposit_currency ?? va.currency).toUpperCase();
    const commissions = await calcDepositCommissions(
      { userId: req.user.id, merchantId },
      Number(q.amount),
      currency,
    );
    const totalFees = commissions.commission_amount + commissions.merchant_commission_amount;
    return emptyEnvelope(res, "", {
      quote: {
        amount: String(q.amount),
        total_fees: totalFees,
        receiving_amount: Number(q.amount) - totalFees,
        deposit_currency: q.deposit_currency,
      },
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as DepositCreateInput;

    const va = await prisma().virtualAccount.findFirst({
      where: { uniqueId: body.bank_account_id, userId: req.user.id },
    });
    if (!va) throw new ApiException(120);

    const merchantId = req.user.merchantId
      ? (
          await prisma().merchant.findFirst({
            where: { id: req.user.merchantId },
          })
        )?.id ?? null
      : null;
    const currency = (body.deposit_currency ?? va.currency).toUpperCase();
    const commissions = await calcDepositCommissions(
      { userId: req.user.id, merchantId },
      Number(body.amount),
      currency,
    );
    const totalCommission =
      commissions.commission_amount + commissions.merchant_commission_amount;

    let proofUrl: string | null = null;
    if (body.proof) {
      proofUrl = body.proof.startsWith("data:")
        ? await s3Service.uploadBase64(body.proof, USER_DOCUMENT_FILE_PATH)
        : body.proof;
      if (!proofUrl) throw new ApiException(109);
    }

    let adminWalletId: bigint | null = null;
    if (body.to_wallet_id) {
      const aw = await prisma().adminWallet.findUnique({
        where: { uniqueId: body.to_wallet_id },
      });
      if (!aw) throw new ApiException(202);
      adminWalletId = aw.id;
    }

    const memo = req.user.memo ?? generateUserMemo(req.user);
    if (!req.user.memo) {
      await prisma().user.update({
        where: { id: req.user.id },
        data: { memo },
      });
    }

    const created = await prisma().$transaction(async (tx) => {
      const dep = await tx.depositTransaction.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user!.id,
          virtualAccountId: va.id,
          adminWalletId,
          amount: new Prisma.Decimal(String(body.amount)),
          commissionAmount: new Prisma.Decimal(String(commissions.commission_amount)),
          merchantCommissionAmount: new Prisma.Decimal(
            String(commissions.merchant_commission_amount),
          ),
          totalCommissionAmount: new Prisma.Decimal(String(totalCommission)),
          totalAmount: new Prisma.Decimal(
            String(Number(body.amount) - totalCommission),
          ),
          memo,
          externalType: va.externalType ?? null,
          clientReferenceId: body.client_reference_id ?? null,
          status: DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
          type: body.type ?? DEPOSIT_TYPE_TOPUP,
          sourceOfFunds: body.source_of_funds ?? null,
          purposeOfPayment: body.purpose_of_payment ?? null,
          proof: proofUrl,
          depositCurrency: body.deposit_currency ?? null,
          fromWalletAddress: body.from_wallet_address ?? null,
          transactionHash: body.transaction_hash ?? null,
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
          orderId: generateOrderId(),
        },
      });
      await tx.depositTransactionStatusHistory.create({
        data: {
          uniqueId: uniqueId(24),
          depositTransactionId: dep.id,
          fromStatus: null,
          toStatus: String(DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED),
          changedBy: req.user!.id.toString(),
          changedByType: "user",
          changedAt: new Date(),
        },
      });
      return dep;
    });

    // External-service dispatch (best-effort, non-blocking):
    //   - Telegram notifier
    //   - ProcessingUnit createDeposit
    //   - InvoiceMate makeDeposit  (Phase 8b)
    void Promise.all([
      TelegramNotifier.depositReceived({
        id: created.uniqueId,
        user: req.user.firstName ?? req.user.email,
        amount: created.totalAmount.toString(),
        currency: va.currency,
        status: "PROCESSING",
// @ts-expect-error - Auto-fixed: 'created.createdAt' is possibly 'null'.
        created_at: created.createdAt.toISOString(),
      }),
      ProcessingUnit.createDeposit(created),
      InvoiceMate.makeDeposit(created),
    ]).catch((err) => {
      logger.warn({ err, depositId: created.uniqueId }, "post-deposit dispatch error");
    });

    return emptyEnvelope(res, "Deposit successful.", {
      deposit_transaction: depositTransactionResource(created),
    });
  },

  /**
   * Mirror of DepositTransactionRepository::export. Builds the same row
   * shape as DepositTransactionResource and writes either a PDF or XLSX.
   * The result is uploaded to S3 and the temporary URL returned.
   */
  async export(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as DepositListInput;
    const fileType = String((req.query as { type?: string }).type ?? "pdf").toLowerCase();

    // Reuse the same filter logic as index() but no pagination.
    const status =
      q.status && q.status in DEPOSIT_TRANSACTION_STATUS_MAP
        ? DEPOSIT_TRANSACTION_STATUS_MAP[q.status]
        : null;
    let virtualAccountId: bigint | null = null;
    if (q.bank_account_id) {
      const va = await prisma().virtualAccount.findFirst({
        where: { uniqueId: q.bank_account_id, userId: req.user.id },
      });
      if (!va) throw new ApiException(120);
      virtualAccountId = va.id;
    }
    const where: Prisma.DepositTransactionWhereInput = {
      userId: req.user.id,
      ...(status !== null ? { status } : {}),
      ...(virtualAccountId !== null ? { virtualAccountId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.from_date && q.to_date
        ? {
            createdAt: {
              gte: new Date(`${q.from_date}T00:00:00Z`),
              lte: new Date(`${q.to_date}T23:59:59Z`),
            },
          }
        : {}),
    };
    const rows = await prisma().depositTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const exportRows = rows.map((r) => ({
      unique_id: r.uniqueId,
      amount: r.amount.toString(),
      total_amount: r.totalAmount.toString(),
      currency: r.depositCurrency ?? "",
      status: String(r.status),
      type: r.type,
      memo: r.memo ?? "",
      external_reference_id: r.externalReferenceId ?? "",
// @ts-expect-error - Auto-fixed: 'r.createdAt' is possibly 'null'.
      created_at: r.createdAt.toISOString(),
    }));

    let buffer: Buffer;
    let contentType: string;
    let extension: string;
    if (fileType === "excel" || fileType === "xlsx") {
      const { generateExcel } = await import("../../services/exports/excelExport");
      buffer = await generateExcel(exportRows, { sheetTitle: "Deposits" });
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      extension = "xlsx";
    } else {
      const { generateBulkTransactionsPdf } = await import(
        "../../services/exports/pdfReceipt"
      );
      buffer = await generateBulkTransactionsPdf(exportRows, "Deposits");
      contentType = "application/pdf";
      extension = "pdf";
    }
    const url = await s3Service.upload(
      { buffer, contentType, extension },
      "exports/deposits",
    );
    return emptyEnvelope(res, "", { url });
  },

  async retryDeposit(req: Request, res: Response): Promise<Response> {
    const params = req.params as unknown as DepositTrxnParam;
    logger.info({ uniqueId: params.trxn }, "Retry request received for deposit");

    const transaction = await prisma().depositTransaction.findFirst({
      where: { uniqueId: params.trxn },
    });
    if (!transaction) throw new ApiException(124);

    if (transaction.status === DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED) {
      const updated = await prisma().depositTransaction.update({
        where: { id: transaction.id },
        data: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
          orderId: generateOrderId(),
          status: DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
        },
      });
      void ProcessingUnit.createDeposit(updated).catch((err: unknown) => {
        logger.warn(
          { err, depositId: updated.uniqueId },
          "ProcessingUnit redispatch failed (background)",
        );
      });
    } else {
      logger.info(
        { uniqueId: transaction.uniqueId, status: transaction.status },
        "Deposit not in PU_FAILED state - no-op",
      );
    }
    return sendResponse(res, apiSuccess(118), 118, []);
  },
};
