import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
  PAYMENT_PROOF_FIRA,
  PAYMENT_PROOF_REQUESTED,
  PAYMENT_PROOF_SWIFT,
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PENDING,
  TAKE_COUNT,
} from "../../helpers/constants";
import {
  beneficiaryFormFields,
  quoteFormFields,
  senderFields,
  transactionFormFields,
} from "../../helpers/formFields";
import { uniqueId } from "../../helpers/uniqueId";
import { s3Service } from "../../services/storage/s3Service";
import { Dispatch } from "../../queues/dispatchers";
import {
  beneficiaryTransactionCallbackResource,
  beneficiaryTransactionResource,
  transactionProofResource,
} from "../../services/beneficiaryTransactions/beneficiaryTransactionResource";
import {
  cancelTransactions,
  createPayoutTransaction,
  listWhere,
  updateTransactionStatus,
} from "../../services/beneficiaryTransactions/beneficiaryTransactionService";
import { validateAndNormalize } from "../../services/beneficiaryAccounts/beneficiaryNormalizer";
import { validateAndNormalizeSender } from "../../services/senders/senderNormalizer";
import {
  GetFormFieldsInput,
  InstantPayoutInput,
  PayoutCancelInput,
  PayoutListInput,
  PayoutShowInput,
  PayoutStoreInput,
  PayoutUpdateStatusInput,
  RetryJobParam,
  RetryParam,
  SendMoneyDirectInput,
  TransactionProofGetInput,
  TransactionProofRequestInput,
} from "../../validators/payout/payoutValidators";
import { logger } from "../../helpers/logger";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\\BeneficiaryTransactionController. Phase 6 ships the
 * complete surface; the Phase 1 reference module that previously lived in
 * this file is replaced.
 */

async function isRemitterDepositEnabled(merchantId: string | null): Promise<boolean> {
  if (!merchantId) return false;
  const merchant = await prisma().merchant.findFirst({ where: { uniqueId: merchantId } });
  if (!merchant || merchant.type !== 1) return false;
  const setting = await prisma().merchantSetting.findUnique({
    where: { merchantId_key: { merchantId: merchant.id, key: "enable_remitter_deposit" } },
  });
  return setting?.value === "1";
}

async function findOneByAnyId(
  userId: bigint,
  ids: { beneficiary_transaction_id?: string; txn_ref_no?: string; client_reference_id?: string },
) {
  return prisma().beneficiaryTransaction.findFirst({
    where: {
      userId,
      OR: [
        ids.beneficiary_transaction_id ? { uniqueId: ids.beneficiary_transaction_id } : { id: -1n },
        ids.txn_ref_no ? { txnRefNo: ids.txn_ref_no } : { id: -1n },
        ids.client_reference_id
          ? { clientReferenceId: ids.client_reference_id }
          : { id: -1n },
      ],
    },
    include: { beneficiaryAccount: true, quote: true },
  });
}

/**
 * Map the GetFormFieldsRequest type token (C2C/C2B/B2C/B2B or numeric
 * USER_TYPE) to (beneficiary_type, remitter_type) - same as Laravel.
 */
function resolvePartyTypes(typeRaw?: string): {
  payment_type: "C2C" | "C2B" | "B2C" | "B2B";
  beneficiary_type: 1 | 2;
  remitter_type: 1 | 2;
} {
  let pt: "C2C" | "C2B" | "B2C" | "B2B" = "C2C";
  if (typeRaw === "C2C" || typeRaw === "C2B" || typeRaw === "B2C" || typeRaw === "B2B") {
    pt = typeRaw;
  } else if (typeRaw === "1" || typeRaw === "INDIVIDUAL" || typeRaw === "PERSONAL") {
    pt = "C2C";
  } else if (typeRaw === "2" || typeRaw === "BUSINESS") {
    pt = "C2B";
  }
  const map: Record<typeof pt, { beneficiary_type: 1 | 2; remitter_type: 1 | 2 }> = {
    C2C: { beneficiary_type: 1, remitter_type: 1 },
    C2B: { beneficiary_type: 1, remitter_type: 2 },
    B2C: { beneficiary_type: 2, remitter_type: 1 },
    B2B: { beneficiary_type: 2, remitter_type: 2 },
  };
  return { payment_type: pt, ...map[pt] };
}

export const payoutController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutListInput;
    const where = await listWhere(req.user, q);
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().beneficiaryTransaction.count({ where }),
      prisma().beneficiaryTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { beneficiaryAccount: true, quote: true },
      }),
    ]);
    return sendResponse(res, "", 200, {
      total,
      beneficiary_transactions: rows.map(beneficiaryTransactionResource),
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PayoutStoreInput;
    const txn = await createPayoutTransaction(body, req.user);
    return sendResponse(res, apiSuccess(108), 108, {
      beneficiary_transaction: beneficiaryTransactionResource(txn),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutShowInput;
    const txn = await findOneByAnyId(req.user.id, q);
    if (!txn) throw new ApiException(124);
    return sendResponse(res, "Transaction fetched.", 200, {
      beneficiary_transaction: beneficiaryTransactionResource(txn),
    });
  },

  async checkTransactionStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutShowInput;
    const txn = await findOneByAnyId(req.user.id, q);
    if (!txn) throw new ApiException(124);
    return sendResponse(res, "Transaction fetched.", 200, {
      beneficiary_transaction: beneficiaryTransactionResource(txn),
    });
  },

  async checkStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutShowInput;
    const txn = await findOneByAnyId(req.user.id, q);
    if (!txn) throw new ApiException(124);
    return sendResponse(res, "Status check successful.", 200, {
      beneficiary_transaction: beneficiaryTransactionCallbackResource(txn),
    });
  },

  async cancel(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PayoutCancelInput;
    const found = await prisma().beneficiaryTransaction.count({
      where: {
        userId: req.user.id,
        uniqueId: { in: body.beneficiary_transaction_ids },
      },
    });
    if (found !== body.beneficiary_transaction_ids.length) {
      throw new ApiException(170);
    }
    const result = await cancelTransactions(
      req.user,
      body.beneficiary_transaction_ids,
      body.remarks,
    );
    return sendResponse(res, "Transactions updated.", 200, result);
  },

  async updateStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PayoutUpdateStatusInput;
    const found = await prisma().beneficiaryTransaction.count({
      where: {
        userId: req.user.id,
        uniqueId: { in: body.beneficiary_transaction_ids },
      },
    });
    if (found !== body.beneficiary_transaction_ids.length) {
      throw new ApiException(170);
    }
    const result = await updateTransactionStatus(
      req.user,
      body.beneficiary_transaction_ids,
      body.status,
      body.remarks,
    );
    return sendResponse(res, "Transactions updated.", 200, result);
  },

  async getFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as GetFormFieldsInput;
    const parties = resolvePartyTypes(q.type);
    const beneficiary = await beneficiaryFormFields({
      country: q.country,
      currency: q.currency,
      type: parties.beneficiary_type,
    });
    const merchantRow = req.user.merchantId
      ? await prisma().merchant.findFirst({
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const remitter = await senderFields({
      type: parties.remitter_type,
      merchantId: merchantRow?.id ?? null,
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user.merchantId),
    });
    const transaction = await transactionFormFields();
    return sendResponse(res, "", 200, {
      form_fields: { transaction, beneficiary, remitter },
    });
  },

  async transactionFormFields(_req: Request, res: Response): Promise<Response> {
    return sendResponse(res, "", 200, { form_fields: await transactionFormFields() });
  },

  async instantGetFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as GetFormFieldsInput;
    const parties = resolvePartyTypes(q.type);
    const beneficiary = await beneficiaryFormFields({
      country: q.country,
      currency: q.currency,
      type: parties.beneficiary_type,
    });
    const merchantRow = req.user.merchantId
      ? await prisma().merchant.findFirst({
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const remitter = await senderFields({
      type: parties.remitter_type,
      merchantId: merchantRow?.id ?? null,
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user.merchantId),
    });
    const quote = await quoteFormFields();
    return sendResponse(res, "", 200, {
      form_fields: { transaction: quote, beneficiary, remitter },
    });
  },

  async direct(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as SendMoneyDirectInput;

    const beneficiary = await validateAndNormalize(
      body.beneficiary as Record<string, unknown>,
      req.user,
    );
    const depositEnabled = await isRemitterDepositEnabled(req.user.merchantId);
    const sender = await validateAndNormalizeSender(
      body.remitter as Record<string, unknown>,
      req.user,
      depositEnabled,
    );
    const transaction = body.transaction as Record<string, unknown>;
    if (!transaction.quote_id) throw new ApiException(121);

    const beneficiaryEmail = beneficiary.beneficiaryAccount.email as string | undefined;
    const accountNumber = beneficiary.beneficiaryAccount.account_number as string | undefined;
    const currency = String(beneficiary.beneficiaryAccount.currency ?? "");
    let beneficiaryAccount = beneficiaryEmail
      ? await prisma().beneficiaryAccount.findFirst({
          where: {
            userId: req.user.id,
            email: beneficiaryEmail,
            accountNumber,
            currency,
            deletedAt: null,
          },
        })
      : null;
    if (!beneficiaryAccount) {
      beneficiaryAccount = await prisma().beneficiaryAccount.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user.id,
          country: String(beneficiary.beneficiaryAccount.country ?? "US"),
          currency,
          firstName: (beneficiary.beneficiaryAccount.first_name as string) ?? null,
          lastName: (beneficiary.beneficiaryAccount.last_name as string) ?? null,
          email: beneficiaryEmail ?? null,
          accountNumber: accountNumber ?? null,
          accountName: (beneficiary.beneficiaryAccount.account_name as string) ?? null,
          bankName: (beneficiary.beneficiaryAccount.bank_name as string) ?? null,
          status: 1,
        },
      });
    }

    const senderIdNumber = sender.id_number as string | undefined;
    let senderRow = senderIdNumber
      ? await prisma().sender.findFirst({
          where: {
            userId: req.user.id,
            idNumber: senderIdNumber,
            deletedAt: null,
          },
        })
      : null;
    if (!senderRow) {
      senderRow = await prisma().sender.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user.id,
          firstName: (sender.first_name as string) ?? null,
          lastName: (sender.last_name as string) ?? null,
          email: (sender.email as string) ?? null,
          idNumber: senderIdNumber ?? null,
          type: sender.type,
          status: 1,
        },
      });
    }

    const txn = await createPayoutTransaction(
      {
        beneficiary_account_id: beneficiaryAccount.uniqueId,
        quote_id: String(transaction.quote_id),
        remitter_id: senderRow.uniqueId,
        remarks: (transaction.remarks as string) ?? undefined,
        supporting_document: (transaction.supporting_document as string) ?? undefined,
        txn_ref_no: (transaction.txn_ref_no as string) ?? undefined,
        purpose_of_payment: (transaction.purpose_of_payment as string) ?? undefined,
        client_reference_id: (transaction.client_reference_id as string) ?? undefined,
      },
      req.user,
    );
    return sendResponse(res, apiSuccess(108), 108, {
      beneficiary_transaction: beneficiaryTransactionResource(txn),
    });
  },

  async instant(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as InstantPayoutInput;

    // Persist a single PayoutJob row carrying the entire row payload; the
    // worker (Phase 8) does the quote create + beneficiary upsert + sender
    // upsert + transaction create as one unit. Mirror of
    // BeneficiaryTransactionRepository::dispatchPayoutJobs.
    const job = await prisma().payoutJob.create({
      data: {
        uniqueId: uniqueId(24),
        userId: req.user.id,
        rowNumber: 1,
        amount: null,
        status: PAYOUT_JOB_STATUS_PENDING,
        payload: {
          source: "instant",
          beneficiary: body.beneficiary,
          remitter: body.remitter,
          transaction: body.transaction,
        } as Prisma.InputJsonValue,
      },
    });
    await Dispatch.bulkPayout({
      payoutJobUniqueId: job.uniqueId,
      userId: req.user.id.toString(),
    });
    return sendResponse(res, apiSuccess(112), 112, []);
  },

  async retryJob(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const params = req.params as unknown as RetryJobParam;
    const job = await prisma().payoutJob.findFirst({
      where: { uniqueId: params.jobId, userId: req.user.id },
    });
    if (!job) throw new ApiException(174);
    if (job.status !== PAYOUT_JOB_STATUS_FAILED) throw new ApiException(175);

    await prisma().payoutJob.update({
      where: { id: job.id },
      data: {
        status: PAYOUT_JOB_STATUS_PENDING,
        errorMessage: null,
        attempts: 0,
      },
    });
    await Dispatch.bulkPayout({
      payoutJobUniqueId: job.uniqueId,
      userId: req.user.id.toString(),
    });
    return sendResponse(res, apiSuccess(176), 176, []);
  },

  async retryExternalService(req: Request, res: Response): Promise<Response> {
    const params = req.params as unknown as RetryParam;
    const transaction = await prisma().beneficiaryTransaction.findFirst({
      where: { uniqueId: params.trxn },
    });
    if (!transaction) throw new ApiException(124);

    const retryable = [
      BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
      BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    ];
    if (!retryable.includes(transaction.status)) throw new ApiException(201);

    if (transaction.status === BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED) {
      const user = await prisma().user.findUnique({
        where: { id: transaction.userId },
      });
      if (user) {
        const { Compliance } = await import("../../services/external/compliance");
        await Compliance.make(transaction, user);
      }
    } else if (
      transaction.status === BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED
    ) {
      await prisma().beneficiaryTransaction.update({
        where: { id: transaction.id },
        data: {
          orderId: `TXN${Date.now().toString().slice(-8)}${uniqueId(4).toUpperCase()}`,
          status: BENEFICIARY_TRANSACTION_APPROVED,
        },
      });
      const job = await prisma().payoutJob.findFirst({
        where: { beneficiaryTransactionId: transaction.id },
        orderBy: { id: "desc" },
      });
      if (job) {
        await Dispatch.payout({
          beneficiaryTransactionId: transaction.id.toString(),
          payoutJobUniqueId: job.uniqueId,
          userId: transaction.userId.toString(),
          source: "approval",
        });
      }
    }
    return sendResponse(res, apiSuccess(118), 118, []);
  },

  async checkExternalServiceStatus(req: Request, res: Response): Promise<Response> {
    const params = req.params as unknown as RetryParam;
    const transaction = await prisma().beneficiaryTransaction.findFirst({
      where: { uniqueId: params.trxn },
    });
    if (!transaction) throw new ApiException(124);
    return sendResponse(res, "", 200, {
      beneficiary_transaction: beneficiaryTransactionCallbackResource(transaction),
    });
  },

  export(_req: Request, _res: Response): never {
    throw new ApiException(
      501,
      "Transaction receipt PDF is not yet available in the Node port (Phase 8).",
      501,
    );
  },

  downloadList(_req: Request, _res: Response): never {
    throw new ApiException(
      501,
      "Bulk transaction export PDF/Excel is not yet available in the Node port (Phase 8).",
      501,
    );
  },

  payoutTemplate(_req: Request, _res: Response): never {
    throw new ApiException(
      501,
      "Bulk payout template export is not yet available in the Node port (Phase 8).",
      501,
    );
  },

  bulkStore(_req: Request, _res: Response): never {
    throw new ApiException(
      501,
      "Bulk payout import is not yet available in the Node port (Phase 8).",
      501,
    );
  },

  async requestProof(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as TransactionProofRequestInput;
    const txn = await prisma().beneficiaryTransaction.findFirst({
      where: { userId: req.user.id, uniqueId: body.beneficiary_transaction_id },
    });
    if (!txn) throw new ApiException(124);
    const existing = await prisma().beneficiaryTransactionProof.findFirst({
      where: { beneficiaryTransactionId: txn.id },
    });
    if (existing) throw new ApiException(199);

    const documentType =
      txn.receivingCurrency === "INR" ? PAYMENT_PROOF_FIRA : PAYMENT_PROOF_SWIFT;

    const url = body.remitter_proof.startsWith("data:")
      ? await s3Service.uploadBase64(body.remitter_proof, USER_DOCUMENT_FILE_PATH)
      : body.remitter_proof;
    if (!url) throw new ApiException(109);

    await prisma().beneficiaryTransactionProof.create({
      data: {
        uniqueId: uniqueId(24),
        beneficiaryTransactionId: txn.id,
        userId: req.user.id,
        documentType,
        remitterProof: url,
        status: PAYMENT_PROOF_REQUESTED,
        requestedAt: new Date(),
      },
    });
    return sendResponse(res, apiSuccess(114), 114, []);
  },

  async getProof(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as TransactionProofGetInput;
    const txn = await prisma().beneficiaryTransaction.findFirst({
      where: { userId: req.user.id, uniqueId: q.beneficiary_transaction_id },
    });
    if (!txn) throw new ApiException(124);
    const proof = await prisma().beneficiaryTransactionProof.findFirst({
      where: { beneficiaryTransactionId: txn.id },
    });
    if (!proof) throw new ApiException(199);
    return sendResponse(res, apiSuccess(115), 115, {
      transaction_proof: transactionProofResource(proof),
    });
  },
};
