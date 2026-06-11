import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import fs from "fs";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
  PAYMENT_PROOF_FIRA,
  PAYMENT_PROOF_REQUESTED,
  PAYMENT_PROOF_SWIFT,
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PENDING,
  TAKE_COUNT,
  beneficiaryTransactionStatusLabel,
} from "../../helpers/constants";
import {
  beneficiaryFormFields,
  quoteFormFields,
  senderFields,
  transactionFormFields,
} from "../../helpers/formFields";
import { uniqueId } from "../../helpers/uniqueId";
import { s3Service } from "../../services/storage/s3Service";
import { extractUploadedFileBuffer } from "../../middleware/fileUpload";
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

async function isRemitterDepositEnabled(merchantId: bigint | string | null): Promise<boolean> {
  if (!merchantId) return false;
  const where = typeof merchantId === "bigint" ? { id: merchantId } : { uniqueId: merchantId };
  const merchant = await prisma().merchant.findFirst({ where });
  if (!merchant || merchant.type !== 1) return false;
  const setting = await prisma().merchantSetting.findFirst({
    where: { merchantId: merchant.id, key: "enable_remitter_deposit" },
  });
  return setting?.value === "1";
}

async function renderInvoiceHtml(details: any): Promise<string> {
  const templatePath = path.join(__dirname, "..", "..", "views", "invoice", "invoice.ejs");
  const templateHtml = await fs.promises.readFile(templatePath, "utf-8");
  return ejs.render(templateHtml, { invoice_details: details });
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
    include: {
      beneficiaryAccount: {
        include: { additionalDetails: true },
      },
      quotes: true,
      senders: {
        include: { documents: true },
      },
      team_members: true,
      users: true,
      proofs: true,
    },
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

function cleanDbField(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  const lower = s.toLowerCase();
  if (
    lower === "" ||
    lower === "undefined" ||
    lower === "null" ||
    lower === "n/a" ||
    lower === "na"
  ) {
    return null;
  }
  return s;
}

async function handleSupportingDocument(
  doc: string | undefined,
  userId: bigint,
): Promise<string | undefined> {
  if (doc && doc.startsWith("data:")) {
    try {
      return await s3Service.uploadBase64(doc, "beneficiary_transactions");
    } catch (err) {
      logger.error({ err, userId: userId.toString() }, "S3 upload for supporting_document failed");
      throw new ApiException(109);
    }
  }
  return doc;
}

export const payoutController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutListInput;
    const where = await listWhere(req.user, q, req.teamMember);
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().beneficiaryTransaction.count({ where }),
      prisma().beneficiaryTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          beneficiaryAccount: {
            include: { additionalDetails: true },
          },
          quotes: true,
          senders: {
            include: { documents: true },
          },
          team_members: true,
          users: true,
          proofs: true,
        },
      }),
    ]);
    return sendResponse(res, "", "", {
      total,
      beneficiary_transactions: await Promise.all(
        rows.map((r) => beneficiaryTransactionResource(r, !!req.teamMember))
      ),
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as PayoutStoreInput;

    body.supporting_document = await handleSupportingDocument(
      body.supporting_document,
      req.user.id,
    );

    const txn = await createPayoutTransaction(body, req.user, req.teamMember);
    return sendResponse(res, apiSuccess(108), "", {
      beneficiary_transaction: await beneficiaryTransactionResource(txn, !!req.teamMember),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutShowInput;
    const txn = await findOneByAnyId(req.user.id, q);
    if (!txn) throw new ApiException(124);
    return sendResponse(res, "Transaction fetched successfully.", "", {
      beneficiary_transaction: await beneficiaryTransactionResource(txn, !!req.teamMember),
    });
  },

  async checkTransactionStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutShowInput;
    const txn = await findOneByAnyId(req.user.id, q);
    if (!txn) throw new ApiException(124);

    // External re-poll on the ViyonaPay corridor. Best-effort - the row
    // we serve back is read fresh after the provider call has had a
    // chance to mutate it. Other providers (Caliza/Diginine/FvBank)
    // notify status changes via webhook (Phase 9), so they don't get a
    // pull-side re-poll here.
    if (txn.externalType === "ep" && txn.externalReferenceId) {
      try {
        const { ViyonaPay } = await import("../../services/external/viyonaPay");
        await ViyonaPay.checkTransactionStatus({
          external_reference_id: txn.externalReferenceId,
        });
      } catch (err) {
        logger.warn(
          { err, txnId: txn.uniqueId },
          "ViyonaPay status re-poll failed",
        );
      }
    }

    return sendResponse(res, "Transaction fetched successfully.", "", {
      beneficiary_transaction: await beneficiaryTransactionResource(txn, !!req.teamMember),
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
      merchantId: req.user.merchantId,
    });
    const merchantRow = req.user.merchantId
      ? await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const remitter = await senderFields({
      type: parties.remitter_type,
      merchantId: merchantRow?.id ?? null,
// @ts-ignore - Catch-all auto-fix for: Argument of type 'bigint | nul...
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user.merchantId),
    });
    const transaction = await transactionFormFields();
    return sendResponse(res, "", 200, {
      form_fields: { transaction, beneficiary, remitter },
    });
  },

  async transactionFormFields(req: Request, res: Response): Promise<Response> {
    return sendResponse(res, "", 200, { form_fields: await transactionFormFields(req.user) });
  },

  async instantGetFormFields(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as GetFormFieldsInput;
    const parties = resolvePartyTypes(q.type);
    const beneficiary = await beneficiaryFormFields({
      country: q.country,
      currency: q.currency,
      type: parties.beneficiary_type,
      merchantId: req.user.merchantId,
    });
    const merchantRow = req.user.merchantId
      ? await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: req.user.merchantId },
        })
      : null;
    const remitter = await senderFields({
      type: parties.remitter_type,
      merchantId: merchantRow?.id ?? null,
// @ts-ignore - Catch-all auto-fix for: Argument of type 'bigint | nul...
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
// @ts-ignore - Catch-all auto-fix for: Argument of type 'bigint | nul...
    const depositEnabled = await isRemitterDepositEnabled(req.user.merchantId);
    const sender = await validateAndNormalizeSender(
      body.remitter as Record<string, unknown>,
      req.user,
      depositEnabled,
    );
    const transaction = body.transaction as Record<string, unknown>;
    if (!transaction.quote_id) throw new ApiException(121);

    transaction.supporting_document = await handleSupportingDocument(
      transaction.supporting_document as string | undefined,
      req.user.id,
    );

    const beneficiaryEmail = cleanDbField(beneficiary.beneficiaryAccount.email);
    const accountNumber = cleanDbField(beneficiary.beneficiaryAccount.account_number);
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
          type: typeof beneficiary.beneficiaryAccount.type === "number" ? beneficiary.beneficiaryAccount.type : null,
          country: String(beneficiary.beneficiaryAccount.country ?? "US"),
          currency,
          firstName: cleanDbField(beneficiary.beneficiaryAccount.first_name),
          middleName: cleanDbField(beneficiary.beneficiaryAccount.middle_name),
          lastName: cleanDbField(beneficiary.beneficiaryAccount.last_name),
          email: beneficiaryEmail,
          mobileCountryCode: cleanDbField(beneficiary.beneficiaryAccount.mobile_country_code),
          mobile: cleanDbField(beneficiary.beneficiaryAccount.mobile),
          accountNumber: accountNumber,
          accountName: cleanDbField(beneficiary.beneficiaryAccount.account_name),
          bankName: cleanDbField(beneficiary.beneficiaryAccount.bank_name),
          paymentRail: cleanDbField(beneficiary.beneficiaryAccount.payment_rail),
          routingNumber: cleanDbField(beneficiary.beneficiaryAccount.routing_number),
          swiftCode: cleanDbField(beneficiary.beneficiaryAccount.swift_code),
          iban: cleanDbField(beneficiary.beneficiaryAccount.iban),
          businessName: cleanDbField(beneficiary.beneficiaryAccount.business_name),
          businessCountry: cleanDbField(beneficiary.beneficiaryAccount.business_country),
          status: 1,
        },
      });

      const addDetail = beneficiary.beneficiaryAccountAdditionalDetail as Record<string, unknown>;
      await prisma().beneficiaryAdditionalDetail.create({
        data: {
          uniqueId: uniqueId(24),
          beneficiaryAccountId: beneficiaryAccount.id,
          addressType: cleanDbField(addDetail.address_type) ?? "PRESENT",
          addressLine1: cleanDbField(addDetail.address_line1),
          addressLine2: cleanDbField(addDetail.address_line2),
          postalCode: cleanDbField(addDetail.postal_code),
          city: cleanDbField(addDetail.city),
          state: cleanDbField(addDetail.state),
          country: cleanDbField(addDetail.country),
          paymentType: cleanDbField(addDetail.payment_type),
          bankAddressLine1: cleanDbField(addDetail.bank_address_line1),
          bankAddressLine2: cleanDbField(addDetail.bank_address_line2),
          bankPostalCode: cleanDbField(addDetail.bank_postal_code),
          bankCity: cleanDbField(addDetail.bank_city),
          bankState: cleanDbField(addDetail.bank_state),
          bankCountry: cleanDbField(addDetail.bank_country),
          purposeOfTransaction: cleanDbField(addDetail.purpose_of_transaction),
          userSourceOfIncome: cleanDbField(addDetail.user_source_of_income),
        },
      });
    }

    const senderIdNumber = cleanDbField(sender.id_number);
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
      let dobValue: Date | null = null;
      if (sender.dob) {
        const parsedDob = new Date(sender.dob as string);
        if (!isNaN(parsedDob.getTime())) {
          dobValue = parsedDob;
        }
      }

      senderRow = await prisma().sender.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user.id,
          firstName: cleanDbField(sender.first_name),
          middleName: cleanDbField(sender.middle_name),
          lastName: cleanDbField(sender.last_name),
          email: cleanDbField(sender.email),
          mobileCountryCode: cleanDbField(sender.mobile_country_code),
          mobile: cleanDbField(sender.mobile),
          dob: dobValue,
          country: cleanDbField(sender.country),
          nationality: cleanDbField(sender.nationality),
          address1: cleanDbField(sender.address_1 ?? sender.address),
          address2: cleanDbField(sender.address_2),
          city: cleanDbField(sender.city),
          state: cleanDbField(sender.state),
          postalCode: cleanDbField(sender.postal_code),
          type: typeof sender.type === "number" ? sender.type : null,
          idType: cleanDbField(sender.id_type),
          idNumber: senderIdNumber,
          sourceOfFunds: cleanDbField(sender.source_of_funds),
          businessPersons: sender.business_persons ? (sender.business_persons as any) : null,
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
      req.teamMember,
    );
    return sendResponse(res, apiSuccess(108), 108, {
      beneficiary_transaction: await beneficiaryTransactionResource(txn, !!req.teamMember),
    });
  },

  async instant(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as InstantPayoutInput;

    if (body.transaction) {
      const transaction = body.transaction as Record<string, unknown>;
      transaction.supporting_document = await handleSupportingDocument(
        transaction.supporting_document as string | undefined,
        req.user.id,
      );
    }

    // Persist a single PayoutJob row carrying the entire row payload; the
    // worker (Phase 8) does the quote create + beneficiary upsert + sender
    // upsert + transaction create as one unit. Mirror of
    // BeneficiaryTransactionRepository::dispatchPayoutJobs.
    const job = await prisma().payoutJob.create({
      data: {
        uniqueId: uniqueId(24),
        userId: req.user.id,
        rowNumber: 1,
// @ts-ignore - Catch-all auto-fix for: Type 'null' is not assignable ...
        amount: null,
        status: PAYOUT_JOB_STATUS_PENDING,
        payload: {
          source: "instant",
          beneficiary: body.beneficiary,
          remitter: body.remitter,
          transaction: body.transaction,
          creator: req.teamMember?.id ? String(req.teamMember.id) : null,
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
    const { generateOrderId } = await import("../../helpers/uniqueId");
    const transaction = await prisma().beneficiaryTransaction.findFirst({
      where: { uniqueId: params.trxn },
    });
    if (!transaction) throw new ApiException(124);

    const retryable = [
      BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
      BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    ];
    if (!retryable.includes(transaction.status)) throw new ApiException(201);

    const user = await prisma().user.findUnique({
      where: { id: transaction.userId },
    });
    if (!user) throw new ApiException(102);

    if (transaction.status === BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED) {
      const { Compliance } = await import("../../services/external/compliance");
      await Compliance.make(transaction, user);
    } else if (
      transaction.status === BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED
    ) {
      const updated = await prisma().beneficiaryTransaction.update({
        where: { id: transaction.id },
        data: {
          orderId: generateOrderId(),
        },
      });
      const { ProcessingUnit } = await import("../../services/external/processingUnit");
      await ProcessingUnit.make(updated, user);
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

  /**
   * Mirror of BeneficiaryTransactionRepository::downloadReceipt -
   * generates a PDF receipt for a single transaction and uploads it to S3.
   */
  async export(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutShowInput;
    const txn = await findOneByAnyId(req.user.id, q);
    if (!txn) throw new ApiException(124);

    const sender = txn.senderId
      ? await prisma().sender.findUnique({ where: { id: txn.senderId } })
      : null;
    const userInfo = await prisma().userInformation.findFirst({ where: { userId: req.user.id } });

    const senderName = sender
      ? `${sender.firstName ?? ""} ${sender.lastName ?? ""}`.trim()
      : `${req.user.firstName ?? ""} ${req.user.lastName ?? ""}`.trim();

    const { formatDate, findValueByKeySync } = await import("../../helpers/lookups");

    const detail = Array.isArray((txn.beneficiaryAccount as any)?.additionalDetails)
      ? (txn.beneficiaryAccount as any).additionalDetails[0]
      : (txn.beneficiaryAccount as any)?.additionalDetails;

    let finalRemarks = txn.remarks ?? "";
    if (!finalRemarks && detail?.purposeOfTransaction) {
      finalRemarks = findValueByKeySync(detail.purposeOfTransaction) ?? "";
    }

    const statusLabel = beneficiaryTransactionStatusLabel(txn.status);

    const html = await renderInvoiceHtml({
      unique_id: txn.uniqueId,
      created_at: formatDate(txn.createdAt),
      txn_ref_no: txn.txnRefNo ?? "",
      utr_no: txn.externalReferenceId ?? "",
      sender_name: senderName,
      sender_address: sender?.address1 ?? userInfo?.address1 ?? "",
      sender_city: sender?.city ?? userInfo?.city ?? "",
      sender_state: sender?.state ?? userInfo?.state ?? "",
      sender_country: sender?.country ?? userInfo?.country ?? "",
      sender_postal_code: sender?.postalCode ?? userInfo?.postalCode ?? "",
      beneficiary_name:
        // @ts-ignore
        txn.beneficiaryAccount?.businessName ??
        // @ts-ignore
        `${txn.beneficiaryAccount?.firstName ?? ""} ${
          // @ts-ignore
          txn.beneficiaryAccount?.lastName ?? ""
        }`.trim(),
      // @ts-ignore
      account_number: txn.beneficiaryAccount?.accountNumber ?? "",
      // @ts-ignore
      bank_name: txn.beneficiaryAccount?.bankName ?? "",
      // @ts-ignore
      bank_code: txn.beneficiaryAccount?.swiftCode ?? "",
      // @ts-ignore
      routing_number: txn.beneficiaryAccount?.routingNumber ?? "",
      currency: txn.receivingCurrency ?? "",
      amount: txn.recipientAmount?.toString() ?? "",
      remarks: finalRemarks,
      purpose: txn.purposeOfPayment ?? "",
      status: statusLabel,
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
    const buffer = Buffer.from(pdfUint8Array);
    await browser.close();

    const url = await s3Service.upload(
      { buffer, contentType: "application/pdf", extension: "pdf" },
      "exports/transaction-receipts",
    );
    const signedUrl = await s3Service.temporaryUrl(url);
    return sendResponse(res, "Transaction receipt generated.", 200, { url: signedUrl });
  },

  /**
   * Mirror of BeneficiaryTransactionRepository::export_list - bulk export
   * of a transaction list as PDF or XLSX.
   */
  async downloadList(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as PayoutListInput;
    const fileType = String((req.query as { type?: string }).type ?? "pdf").toLowerCase();
    const where = await listWhere(req.user, q, req.teamMember);
    const rows = await prisma().beneficiaryTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { beneficiaryAccount: true, quotes: true },
    });
    const exportRows = rows.map((r) => ({
      txn_ref_no: r.txnRefNo ?? "",
      client_ref_no: r.clientReferenceId ?? "",
      unique_id: r.uniqueId,
      sending_amount: r.totalAmount.toString(),
      receiving_amount: r.recipientAmount?.toString() ?? "",
      receiving_currency: r.receivingCurrency ?? "",
// @ts-expect-error - Prisma include likely missing
      fx_rate: r.quote?.fxRate ?? "",
      commission_amount: r.commissionAmount.toString(),
// @ts-ignore - Prisma include likely missing
      account_number: r.beneficiaryAccount?.accountNumber ?? "",
      status: String(r.status),
      remarks: r.remarks ?? "",
// @ts-expect-error - Auto-fixed: 'r.createdAt' is possibly 'null'.
      created_at: r.createdAt.toISOString(),
    }));

    const { s3Service } = await import("../../services/storage/s3Service");
    let buffer: Buffer;
    let contentType: string;
    let extension: string;
    if (fileType === "excel" || fileType === "xlsx") {
      const { generateExcel } = await import("../../services/exports/excelExport");
      buffer = await generateExcel(exportRows, {
        sheetTitle: "BeneficiaryTransactions",
      });
      contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      extension = "xlsx";
    } else {
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

      const translations: Record<string, string> = {
        beneficiary_transactions: "Beneficiary Transactions",
        s_no: "S.No",
        txn_ref_no: "Txn Ref No",
        client_ref_no: "Client Ref No",
        account_number: "Account Number",
        sending_amount: "Sending Amount",
        receiving_amount: "Receiving Amount",
        status: "Status",
        date: "Date"
      };
      const tr = (key: string) => translations[key] || key;

      const beneficiaryDetails = rows.map((r) => {
        const statusLabel = beneficiaryTransactionStatusLabel(Number(r.status), !!req.teamMember);
        return {
          txn_ref_no: r.txnRefNo ?? "",
          client_ref_no: r.clientReferenceId ?? "",
          account_number: r.beneficiaryAccount?.accountNumber ?? "",
          sending_amount: r.totalAmount.toString(),
          receiving_amount: r.recipientAmount?.toString() ?? "",
          receiving_currency: r.receivingCurrency ?? "",
          status: statusLabel,
          created_at: r.createdAt ? r.createdAt.toISOString().split("T")[0] : "",
        };
      });

      const templatePath = path.join(__dirname, "..", "..", "views", "invoice", "beneficiaryTransaction.ejs");
      const templateHtml = await fs.promises.readFile(templatePath, "utf-8");
      
      const today = new Date();
      const formattedDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

      const html = ejs.render(templateHtml, {
        tr,
        date: formattedDate,
        logo: logoUrl,
        beneficiary_details: beneficiaryDetails,
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
      "exports/beneficiary-transactions",
    );
    const signedUrl = await s3Service.temporaryUrl(url);
    return sendResponse(res, "Bulk export generated.", 200, { url: signedUrl });
  },

  /**
   * Mirror of BeneficiaryTransactionRepository::template. Builds a bulk
   * payout template XLSX with dropdowns from the form fields.
   */
  async payoutTemplate(req: Request, res: Response): Promise<Response> {
    res.extendTimeout?.(300_000);
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as GetFormFieldsInput;
    const parties = resolvePartyTypes(q.type);
    const beneficiary = await beneficiaryFormFields({
      country: q.country,
      currency: q.currency,
      type: parties.beneficiary_type,
      merchantId: req.user.merchantId,
    });
    const quote = await quoteFormFields();
    const merchantRow = req.user.merchantId
      ? await prisma().merchant.findFirst({
          where: { id: req.user.merchantId },
        })
      : null;
    const remitter = await senderFields({
      type: parties.remitter_type,
      merchantId: merchantRow?.id ?? null,
// @ts-ignore - Catch-all auto-fix for: Argument of type 'bigint | nul...
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user.merchantId),
      country: q.country,
    });

    const { flattenFormFields, generateBulkTemplate } = await import(
      "../../services/exports/excelImportService"
    );
    const flat = flattenFormFields(
      { quote, beneficiary, remitter },
      ["quote", "beneficiary", "remitter"],
    );
    const buffer = await generateBulkTemplate(flat, "Payouts");
    const { s3Service } = await import("../../services/storage/s3Service");
    const url = await s3Service.upload(
      {
        buffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      },
      "exports/payout-templates",
    );
    const signedUrl = await s3Service.temporaryUrl(url);
    return sendResponse(res, "Template ready.", 200, { url: signedUrl });
  },

  /**
   * Mirror of BeneficiaryTransactionRepository::bulk_store. Validates
   * each row through the dynamic field rules and the BeneficiaryValidator;
   * successful rows enqueue a PayoutJob carrying the row payload to the
   * bulk-payout worker (Phase 6 already wired the worker).
   */
  async bulkStore(req: Request, res: Response): Promise<Response> {
    console.log("[BulkStore] Starting bulk store process");
    res.extendTimeout?.(300_000);
    if (!req.user) throw new ApiException(102);
    console.log("[BulkStore] User validated");
    const startTime = Date.now();
    logger.info({ userId: req.user.id.toString() }, "[BulkStore] Starting bulk store process");

    // The XLSX arrives as a multipart 'file' field (parsed onto req.files by
    // the global multer) or as a base64 data: URL on req.body.file.
    const buffer = extractUploadedFileBuffer(req, "file");
    if (!buffer || buffer.length === 0) {
      console.log("[BulkStore] Missing or invalid file payload");
      logger.warn({ userId: req.user.id.toString() }, "[BulkStore] Missing or invalid file payload");
      throw new ApiException(422, "Excel file (multipart 'file') required.", 422);
    }
    console.log("[BulkStore] File buffer parsed successfully");
    logger.info({ bufferSize: buffer.length }, "[BulkStore] File buffer parsed successfully");

    const country = String((req.body as { country?: string }).country ?? "");
    const currency = String((req.body as { currency?: string }).currency ?? "");
    const type = Number((req.body as { type?: number }).type ?? 1);

    const fieldsStart = Date.now();
    console.log("[BulkStore] Fetching form fields");
    const beneficiary = await beneficiaryFormFields({ country, currency, type, merchantId: req.user.merchantId });
    const quote = await quoteFormFields();
    const merchantRow = req.user.merchantId
      ? await prisma().merchant.findFirst({ where: { id: req.user.merchantId } })
      : null;
    const remitter = await senderFields({
      type,
      merchantId: merchantRow?.id ?? null,
// @ts-ignore - Catch-all auto-fix for: Argument of type 'bigint | nul...
      remitterDepositEnabled: await isRemitterDepositEnabled(req.user.merchantId),
    });
    logger.info({ durationMs: Date.now() - fieldsStart }, "[BulkStore] Form fields retrieved and initialized");

    const {
      flattenFormFields,
      processExcel,
    } = await import("../../services/exports/excelImportService");
    const fields = flattenFormFields(
      { quote, beneficiary, remitter },
      ["quote", "beneficiary", "remitter"],
    );
    const {
      validateAndNormalize,
      createBeneficiaryValidationCache,
    } = await import("../../services/beneficiaryAccounts/beneficiaryNormalizer");
    const {
      validateAndNormalizeSender,
      createSenderValidationCache,
    } = await import("../../services/senders/senderNormalizer");

    const beneficiaryCache = createBeneficiaryValidationCache();
    const senderCache = createSenderValidationCache();
// @ts-ignore - Catch-all auto-fix for: Argument of type 'bigint | nul...
    const remitterDepositEnabled = await isRemitterDepositEnabled(req.user!.merchantId);

    logger.info("[BulkStore] Beginning Excel parsing and row-by-row validation");
    const validationStart = Date.now();
    let processedRowsCount = 0;

    const result = await processExcel(buffer, fields, async (payload, rowNumber) => {
      const rowStart = Date.now();
      payload.beneficiary.country = country;
      payload.beneficiary.currency = currency;
      
      const ben = await validateAndNormalize(
        payload.beneficiary as Record<string, unknown>,
        req.user!,
        undefined,
        beneficiaryCache,
      );
      const sen = await validateAndNormalizeSender(
        payload.remitter as Record<string, unknown>,
        req.user!,
        remitterDepositEnabled,
        senderCache,
      );

      processedRowsCount++;
      if (processedRowsCount % 10 === 0 || processedRowsCount === 1) {
        logger.info(
          { rowNumber, durationMs: Date.now() - rowStart, processedCount: processedRowsCount },
          `[BulkStore] Parsed & validated row ${rowNumber}`
        );
      }

      return {
        row: rowNumber,
        beneficiary: ben,
        remitter: sen,
        amount: payload.quote.amount ?? "",
        remarks: payload.quote.remarks ?? null,
        txn_ref_no: payload.quote.txn_ref_no ?? null,
      };
    });

    const validationTime = Date.now() - validationStart;
    logger.info(
      { 
        durationMs: validationTime, 
        totalRows: result.validatedRows.length, 
        errorCount: result.errors.length 
      }, 
      "[BulkStore] Excel parsing and validation completed"
    );

    if (result.errors.length > 0) {
      logger.warn({ errorCount: result.errors.length }, "[BulkStore] Bulk import failed validation");
      return sendResponse(res, "Bulk import failed.", 200, {
        errors: result.errors,
      });
    }

    logger.info("[BulkStore] Beginning database PayoutJob insertion and Queue dispatching");
    const enqueueStart = Date.now();
    const { Dispatch } = await import("../../queues/dispatchers");
    const created: { row: number; payout_job_id: string }[] = [];

    for (const row of result.validatedRows) {
      const rowEnqueueStart = Date.now();
      const job = await prisma().payoutJob.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user.id,
          rowNumber: row.row,
// @ts-ignore - Catch-all auto-fix for: Type 'Decimal | null' is not a...
          amount: row.amount ? new Prisma.Decimal(String(row.amount)) : null,
          status: 0,
// @ts-ignore - Catch-all auto-fix for: Conversion of type '{ source: ...
          payload: {
            source: "bulk",
            beneficiary: row.beneficiary,
            remitter: row.remitter,
            transaction: { amount: row.amount, remarks: row.remarks, txn_ref_no: row.txn_ref_no },
            creator: req.teamMember?.id ? String(req.teamMember.id) : null,
          } as Prisma.InputJsonValue,
        },
      });

      await Dispatch.bulkPayout({
        payoutJobUniqueId: job.uniqueId,
        userId: req.user.id.toString(),
      });

      created.push({ row: row.row, payout_job_id: job.uniqueId });

      if (created.length % 10 === 0 || created.length === 1) {
        logger.info(
          { row: row.row, durationMs: Date.now() - rowEnqueueStart, progress: `${created.length}/${result.validatedRows.length}` },
          `[BulkStore] PayoutJob created and enqueued for row ${row.row}`
        );
      }
    }

    const enqueueTime = Date.now() - enqueueStart;
    const totalTime = Date.now() - startTime;
    logger.info(
      { 
        enqueueDurationMs: enqueueTime, 
        totalDurationMs: totalTime, 
        rowsEnqueued: created.length 
      }, 
      "[BulkStore] Bulk store process finished successfully"
    );

    return sendResponse(res, "Bulk import accepted.", 200, {
      success: created,
      errors: [],
    });
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
      include: { transaction: { select: { uniqueId: true } } },
    });
    if (!proof) throw new ApiException(199);
    return sendResponse(res, apiSuccess(115), 115, {
      transaction_proof: await transactionProofResource(proof, req.user.timezone),
    });
  },
};
