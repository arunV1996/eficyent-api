import { Request, Response } from "express";
import { Op } from "sequelize";
import { validateAndNormalizeBeneficiary } from "../helpers/beneficiary_normalizer.helper";
import {
    buildListFilter,
    cancelTransactions,
    findTransactionByAnyId,
    listTransactions,
    updateTransactionStatus,
} from "../helpers/beneficiary_transaction.helper";
import {
    formatReportDate,
    loadLogoDataUrl,
    renderPdfFromHtml,
    renderViewTemplate,
} from "../helpers/pdf_export.helper";
import { CodedError } from "../helpers/coded_error.helper";
import {
    beneficiaryFormFields,
    quoteFormFields,
    senderFields,
    transactionFormFields as buildTransactionFormFields,
} from "../helpers/form_fields.helper";
import {
    createPayoutTransaction,
    isRemitterDepositEnabled,
} from "../helpers/payout_transaction.helper";
import { findValueByKey } from "../helpers/lookup.helper";
import { validateAndNormalizeSender } from "../helpers/sender_normalizer.helper";
import { teamMemberContext } from "../helpers/team_context.helper";
import { passesTransactionTfa } from "../helpers/tfa.helper";
import {
    findOrCreateBeneficiaryAccount,
    findOrCreateSender,
} from "../helpers/party_upsert.helper";
import { Dispatch } from "../jobs";
import { computeBankBalance, getWalletBalance } from "../helpers/balance.helper";
import { reverseRefund } from "../helpers/refund.helper";
import { extractUploadedFileBuffer } from "../helpers/uploaded_file.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import * as complianceService from "../services/compliance.service";
import {
    flattenFormFields,
    generateBulkTemplate,
    processExcel,
} from "../services/excel_import.service";
import * as processingUnitService from "../services/processing_unit.service";
import { generateExcel } from "../services/excel_export.service";
import { temporaryUrl, upload } from "../services/s3.service";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionProof from "../models/beneficiary_transaction_proof.model";
import Ledger from "../models/ledger.model";
import Merchant from "../models/merchant.model";
import PayoutJob from "../models/payout_job.model";
import Quote from "../models/quote.model";
import Sender from "../models/sender.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import UserInformation from "../models/user_information.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import {
    beneficiaryTransactionCallbackToJSON,
    beneficiaryTransactionToJSON,
    transactionProofToJSON,
} from "../resources/beneficiary_transaction.resource";
import { uploadBase64 } from "../services/s3.service";
import {
    beneficiaryTransactionStatusLabel,
    formatDateHuman,
    generateOrderId,
    generateUniqueId,
} from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_APPROVAL_MAP,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
    EXTERNAL_TYPE_AEX,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    PAYMENT_PROOF_FIRA,
    PAYMENT_PROOF_REQUESTED,
    PAYMENT_PROOF_SWIFT,
    PAYOUT_JOB_STATUS_FAILED,
    PAYOUT_JOB_STATUS_PENDING,
    TAKE_COUNT,
    USER_TYPE_BUSINESS,
} from "../utils/constants";
import Decimal from "decimal.js";
import JSZip from "jszip";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\BeneficiaryTransactionController (via the legacy
 * payoutController): list, store, show, check_transaction_status,
 * check_status, cancel, update-status, the transaction-proof pair,
 * the form-fields trio, /direct and /instant/store.
 *
 * The public /retry-job and /check_external_service_status routes live
 * at the /user mount (no auth — mirror of Laravel).
 *
 * Team tokens (authTeam) flow through unchanged: req.teamMember is
 * threaded into the creator context, list scoping and the resource
 * isTeam flag — mirror of the legacy controller.
 *
 * Every error path keeps the legacy code + HTTP status; every success
 * path keeps the legacy message/code envelope byte-identical.
 */

const handleSupportingDocument = async (
    document: string | undefined,
): Promise<string | undefined> => {
    if (document && document.startsWith("data:")) {
        try {
            return await uploadBase64(document, "beneficiary_transactions");
        } catch {
            throw new CodedError("File upload failed.", 109, 400);
        }
    }
    return document;
};

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

/**
 * GET /api/user/beneficiary-transactions/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;

        const { total, rows } = await listTransactions(
            req.user,
            {
                status: query.status,
                from_date: query.from_date,
                to_date: query.to_date,
                bank_account_id: query.bank_account_id,
                wallet_id: query.wallet_id,
                search_key: query.search_key,
                skip,
                take,
            },
            teamMemberContext(req),
        );

        const beneficiaryTransactions = [];
        for (const row of rows) {
            beneficiaryTransactions.push(
                await beneficiaryTransactionToJSON(row, !!req.teamMember),
            );
        }

        return res.sendResponse(
            { total, beneficiary_transactions: beneficiaryTransactions },
            "",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/store
 */
export const store = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (!(await passesTransactionTfa(req))) {
            return res.sendError(res.__("139"), 139, 400);
        }

        const supportingDocument = await handleSupportingDocument(
            req.body.supporting_document,
        );

        const transaction = await createPayoutTransaction(
            {
                beneficiary_account_id: req.body.beneficiary_account_id,
                quote_id: req.body.quote_id,
                remitter_id: req.body.remitter_id,
                remarks: req.body.remarks,
                supporting_document: supportingDocument,
                txn_ref_no: req.body.txn_ref_no,
                purpose_of_payment: req.body.purpose_of_payment,
                client_reference_id: req.body.client_reference_id,
            },
            req.user,
            teamMemberContext(req),
        );

        return res.sendResponse(
            {
                beneficiary_transaction: await beneficiaryTransactionToJSON(
                    transaction,
                    !!req.teamMember,
                ),
            },
            res.__("success.108"),
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const transaction = await findTransactionByAnyId(req.user.id, query);
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        return res.sendResponse(
            {
                beneficiary_transaction: await beneficiaryTransactionToJSON(
                    transaction,
                    !!req.teamMember,
                ),
            },
            "Transaction fetched successfully.",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/check_transaction_status
 *
 * Deferred with the provider tranche: the best-effort ViyonaPay
 * status re-poll the legacy controller fires for externalType "ep"
 * before re-reading the row (other providers push status via webhook,
 * so their behavior is identical already).
 */
export const checkTransactionStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const transaction = await findTransactionByAnyId(req.user.id, query);
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        return res.sendResponse(
            {
                beneficiary_transaction: await beneficiaryTransactionToJSON(
                    transaction,
                    !!req.teamMember,
                ),
            },
            "Transaction fetched successfully.",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/check_status
 */
export const checkStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const transaction = await findTransactionByAnyId(req.user.id, query);
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        return res.sendResponse(
            {
                beneficiary_transaction:
                    beneficiaryTransactionCallbackToJSON(transaction),
            },
            "Status check successful.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/cancel
 */
export const cancel = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const transactionIds = req.body.beneficiary_transaction_ids as string[];
        const found = await BeneficiaryTransaction.count({
            where: {
                userId: req.user.id,
                uniqueId: { [Op.in]: transactionIds },
            },
        });
        if (found !== transactionIds.length) {
            return res.sendError(
                "One or more transactions could not be located for the user.",
                170,
                400,
            );
        }
        const result = await cancelTransactions(
            req.user,
            transactionIds,
            req.body.remarks,
        );
        return res.sendResponse(result, "Transactions updated.", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/update-status
 */
export const updateStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const transactionIds = req.body.beneficiary_transaction_ids as string[];
        const found = await BeneficiaryTransaction.count({
            where: {
                userId: req.user.id,
                uniqueId: { [Op.in]: transactionIds },
            },
        });
        if (found !== transactionIds.length) {
            return res.sendError(
                "One or more transactions could not be located for the user.",
                170,
                400,
            );
        }
        const statusValue =
            BENEFICIARY_TRANSACTION_APPROVAL_MAP[String(req.body.status)];
        const result = await updateTransactionStatus(
            req.user,
            transactionIds,
            statusValue,
            req.body.remarks,
            teamMemberContext(req),
        );
        return res.sendResponse(result, "Transactions updated.", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/request-proof
 */
export const requestProof = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const transaction = await BeneficiaryTransaction.findOne({
            where: {
                userId: req.user.id,
                uniqueId: req.body.beneficiary_transaction_id,
            },
        });
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        const existingProof = await BeneficiaryTransactionProof.findOne({
            where: { beneficiaryTransactionId: transaction.id },
        });
        if (existingProof) {
            return res.sendError(
                "Proof already requested or unavailable.",
                199,
                400,
            );
        }

        const documentType =
            transaction.receivingCurrency === "INR"
                ? PAYMENT_PROOF_FIRA
                : PAYMENT_PROOF_SWIFT;

        const remitterProof = req.body.remitter_proof as string;
        const proofUrl = remitterProof.startsWith("data:")
            ? await uploadBase64(remitterProof, USER_DOCUMENT_FILE_PATH)
            : remitterProof;
        if (!proofUrl) {
            return res.sendError("File upload failed.", 109, 400);
        }

        await BeneficiaryTransactionProof.create({
            uniqueId: generateUniqueId(24),
            beneficiaryTransactionId: transaction.id,
            documentType,
            remitterProof: proofUrl,
            status: PAYMENT_PROOF_REQUESTED,
            requestedAt: new Date(),
        });
        return res.sendResponse([], res.__("success.114"), 114);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/get-proof
 */
export const getProof = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const transaction = await BeneficiaryTransaction.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.query.beneficiary_transaction_id),
            },
        });
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        const proof = await BeneficiaryTransactionProof.findOne({
            where: { beneficiaryTransactionId: transaction.id },
        });
        if (!proof) {
            return res.sendError(
                "Proof already requested or unavailable.",
                199,
                400,
            );
        }
        return res.sendResponse(
            {
                transaction_proof: await transactionProofToJSON(
                    proof,
                    transaction.uniqueId,
                    req.user.timezone,
                ),
            },
            res.__("success.115"),
            115,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * Maps the GetFormFields type token (C2C/C2B/B2C/B2B or a numeric /
 * label user type) to the (beneficiary_type, remitter_type) pair —
 * mirror of the legacy resolvePartyTypes.
 */
const resolvePartyTypes = (
    typeToken?: string,
): {
    payment_type: "C2C" | "C2B" | "B2C" | "B2B";
    beneficiary_type: 1 | 2;
    remitter_type: 1 | 2;
} => {
    // Case-insensitive: "b2c" must map to B2C, not fall through to the
    // C2C default.
    const typeRaw = typeToken?.toUpperCase();
    let paymentType: "C2C" | "C2B" | "B2C" | "B2B" = "C2C";
    if (
        typeRaw === "C2C" ||
        typeRaw === "C2B" ||
        typeRaw === "B2C" ||
        typeRaw === "B2B"
    ) {
        paymentType = typeRaw;
    } else if (
        typeRaw === "1" ||
        typeRaw === "INDIVIDUAL" ||
        typeRaw === "PERSONAL"
    ) {
        paymentType = "C2C";
    } else if (typeRaw === "2" || typeRaw === "BUSINESS") {
        paymentType = "C2B";
    }
    const partyMap: Record<
        typeof paymentType,
        { beneficiary_type: 1 | 2; remitter_type: 1 | 2 }
    > = {
        C2C: { beneficiary_type: 1, remitter_type: 1 },
        // C2B (bill payment): individual remitter paying a business
        // beneficiary; B2C (corporate disbursement): business remitter
        // paying an individual beneficiary.
        C2B: { beneficiary_type: 2, remitter_type: 1 },
        B2C: { beneficiary_type: 1, remitter_type: 2 },
        B2B: { beneficiary_type: 2, remitter_type: 2 },
    };
    return { payment_type: paymentType, ...partyMap[paymentType] };
};

/**
 * GET /api/user/beneficiary-transactions/get-form-fields
 */
export const getFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const parties = resolvePartyTypes(query.type);
        const beneficiary = await beneficiaryFormFields({
            country: String(query.country),
            currency: String(query.currency),
            type: parties.beneficiary_type,
            merchantId: req.user.merchantId,
            payment_rail: query.payment_rail
                ? String(query.payment_rail)
                : null,
        });
        const merchantRow = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const remitter = await senderFields({
            type: parties.remitter_type,
            merchantId: merchantRow?.id ?? null,
            remitterDepositEnabled: await isRemitterDepositEnabled(
                req.user.merchantId,
            ),
        });
        const transaction = await buildTransactionFormFields(
            req.user,
            query.type,
            query.country,
        );
        return res.sendResponse(
            { form_fields: { transaction, beneficiary, remitter } },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/transaction-form-fields
 */
export const transactionFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const query = req.query as { type?: string; country?: string };
        return res.sendResponse(
            {
                form_fields: await buildTransactionFormFields(
                    req.user,
                    query.type,
                    query.country,
                ),
            },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/instant/get-form-fields
 */
export const instantGetFormFields = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const parties = resolvePartyTypes(query.type);
        const beneficiary = await beneficiaryFormFields({
            country: String(query.country),
            currency: String(query.currency),
            type: parties.beneficiary_type,
            merchantId: req.user.merchantId,
            payment_rail: query.payment_rail
                ? String(query.payment_rail)
                : null,
        });
        const merchantRow = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const remitter = await senderFields({
            type: parties.remitter_type,
            merchantId: merchantRow?.id ?? null,
            remitterDepositEnabled: await isRemitterDepositEnabled(
                req.user.merchantId,
            ),
        });
        const quote = await quoteFormFields();
        return res.sendResponse(
            { form_fields: { transaction: quote, beneficiary, remitter } },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/direct — single-call payout:
 * validates + upserts the beneficiary and remitter, then creates the
 * transaction against the supplied quote.
 */
export const direct = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (!(await passesTransactionTfa(req))) {
            return res.sendError(res.__("139"), 139, 400);
        }

        const beneficiary = await validateAndNormalizeBeneficiary(
            req.body.beneficiary as Record<string, unknown>,
            req.user,
        );
        const depositEnabled = await isRemitterDepositEnabled(
            req.user.merchantId,
        );
        const sender = await validateAndNormalizeSender(
            req.body.remitter as Record<string, unknown>,
            req.user,
            depositEnabled,
        );
        const transaction = req.body.transaction as Record<string, unknown>;
        if (!transaction.quote_id) {
            return res.sendError("Quote not found.", 121, 400);
        }

        transaction.supporting_document = await handleSupportingDocument(
            transaction.supporting_document as string | undefined,
        );

        // Beneficiary upsert: reuse an existing account matching
        // (account number, currency, email when supplied); otherwise
        // create the account + additional-detail pair. Sender upsert:
        // reuse by id_number, otherwise create. Both run through the
        // lock-serialized shared helpers so concurrent submissions
        // (and bulk rows) can never insert duplicates.
        const beneficiaryAccount = await findOrCreateBeneficiaryAccount(
            req.user,
            beneficiary,
        );
        const senderRow = await findOrCreateSender(req.user, sender);

        const createdTransaction = await createPayoutTransaction(
            {
                beneficiary_account_id: beneficiaryAccount.uniqueId,
                quote_id: String(transaction.quote_id),
                remitter_id: senderRow.uniqueId,
                remarks: (transaction.remarks as string) ?? undefined,
                supporting_document:
                    (transaction.supporting_document as string) ?? undefined,
                txn_ref_no: (transaction.txn_ref_no as string) ?? undefined,
                purpose_of_payment:
                    (transaction.purpose_of_payment as string) ?? undefined,
                client_reference_id:
                    (transaction.client_reference_id as string) ?? undefined,
            },
            req.user,
            teamMemberContext(req),
        );
        return res.sendResponse(
            {
                beneficiary_transaction: await beneficiaryTransactionToJSON(
                    createdTransaction,
                    !!req.teamMember,
                ),
            },
            res.__("success.108"),
            108,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/instant/store — persists one
 * PayoutJob carrying the whole payload; the bulk-payout worker does the
 * quote create + beneficiary/sender upsert + transaction create as one
 * unit (mirror of BeneficiaryTransactionRepository::dispatchPayoutJobs).
 */
export const instant = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        if (req.body.transaction) {
            const transaction = req.body.transaction as Record<
                string,
                unknown
            >;
            transaction.supporting_document = await handleSupportingDocument(
                transaction.supporting_document as string | undefined,
            );
        }

        const payoutJob = await PayoutJob.create({
            uniqueId: generateUniqueId(24),
            userId: req.user.id,
            rowNumber: 1,
            amount: null,
            status: PAYOUT_JOB_STATUS_PENDING,
            payload: {
                source: "instant",
                beneficiary: req.body.beneficiary,
                remitter: req.body.remitter,
                transaction: req.body.transaction,
                creator: req.teamMember?.id ? String(req.teamMember.id) : null,
            },
        });
        await Dispatch.bulkPayout({
            payoutJobUniqueId: payoutJob.uniqueId,
            userId: String(req.user.id),
        });
        return res.sendResponse([], res.__("success.112"), 112);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/check_external_service_status/:trxn — public status
 * probe returning the slim callback resource.
 */
export const checkExternalServiceStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const transaction = await BeneficiaryTransaction.findOne({
            where: { uniqueId: String(req.params.trxn) },
        });
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        return res.sendResponse(
            {
                beneficiary_transaction:
                    beneficiaryTransactionCallbackToJSON(transaction),
            },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/public/retry_external_service/:trxn — re-drives a payout
 * that stalled at an initiation-failed state back through the provider.
 *
 * Mirror of the legacy payoutController.retryExternalService (public,
 * no auth). For COMPLIANCE_INITIATION_FAILED it re-runs Compliance.make;
 * for PU_INITIATION_FAILED it mints a fresh order id and re-runs
 * ProcessingUnit.make. If a refund was already issued for the stalled
 * transaction, the refund chain is reversed first — but only after a
 * balance re-check (unless remitter-deposit is enabled), so a reversal
 * can't push the source below zero.
 */
export const retryExternalService = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const transaction = await BeneficiaryTransaction.findOne({
            where: { uniqueId: String(req.params.trxn) },
        });
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }

        const retryable = [
            BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
            BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
        ];
        if (!retryable.includes(transaction.status)) {
            return res.sendError(
                "Transaction is not in a retryable state.",
                201,
                400,
            );
        }

        const user = await User.findByPk(transaction.userId);
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const originalLedger = await Ledger.findOne({
            where: {
                transactionType: MORPH_BENEFICIARY_TRANSACTION,
                transactionId: transaction.id,
            },
        });
        if (originalLedger) {
            const refundLedger = await Ledger.findOne({
                where: { refundLedgerId: originalLedger.id },
            });
            if (refundLedger) {
                let teamMemberContextInfo: {
                    role: number;
                    id: number;
                } | null = null;
                if (transaction.teamMemberId) {
                    const teamMember = await TeamMember.findByPk(
                        transaction.teamMemberId,
                    );
                    if (teamMember) {
                        teamMemberContextInfo = {
                            role: teamMember.role,
                            id: teamMember.id,
                        };
                    }
                }

                const quote = transaction.quoteId
                    ? await Quote.findByPk(transaction.quoteId)
                    : null;
                if (quote) {
                    let currentBalance = new Decimal(0);
                    if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
                        const virtualAccount = await VirtualAccount.findByPk(
                            quote.sourceId ?? undefined,
                        );
                        if (virtualAccount) {
                            currentBalance = await computeBankBalance(
                                user,
                                virtualAccount,
                                teamMemberContextInfo,
                            );
                        }
                    } else if (quote.sourceType === MORPH_WALLET) {
                        const wallet = await Wallet.findByPk(
                            quote.sourceId ?? undefined,
                        );
                        if (wallet) {
                            currentBalance = await getWalletBalance(
                                user,
                                wallet,
                            );
                        }
                    }

                    const remitterDepositEnabled =
                        await isRemitterDepositEnabled(user.merchantId);
                    if (
                        !remitterDepositEnabled &&
                        currentBalance.lt(transaction.totalAmount)
                    ) {
                        return res.sendError("Insufficient balance.", 154, 400);
                    }
                }
                await reverseRefund(transaction);
            }
        }

        if (
            transaction.status ===
            BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED
        ) {
            await complianceService.make(transaction, user);
        } else if (
            transaction.status ===
            BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED
        ) {
            transaction.orderId = generateOrderId();
            await transaction.save();
            await processingUnitService.make(transaction, user);
        }

        return res.sendResponse([], res.__("success.118"), 118);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/bulk/template — builds the
 * bulk-payout XLSX template (mandatory quote/beneficiary/remitter
 * fields, with dropdowns), uploads it to S3 and returns the signed URL.
 * Mirror of the legacy payoutController.payoutTemplate.
 */
export const payoutTemplate = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const parties = resolvePartyTypes(query.type);
        const beneficiary = await beneficiaryFormFields({
            country: String(query.country),
            currency: String(query.currency),
            type: parties.beneficiary_type,
            merchantId: req.user.merchantId,
        });
        const quote = await quoteFormFields();
        const merchantRow = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const remitter = req.user.enableSender
            ? await senderFields({
                  type: parties.remitter_type,
                  merchantId: merchantRow?.id ?? null,
                  remitterDepositEnabled: await isRemitterDepositEnabled(
                      req.user.merchantId,
                  ),
                  country: query.country,
              })
            : [];

        const flat = flattenFormFields({ quote, beneficiary, remitter }, [
            "quote",
            "beneficiary",
            ...(req.user.enableSender ? ["remitter"] : []),
        ]);
        const buffer = await generateBulkTemplate(flat, "Payouts");
        const key = await upload(
            {
                buffer,
                contentType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                extension: "xlsx",
            },
            "exports/payout-templates",
        );
        const signedUrl = await temporaryUrl(key);
        return res.sendResponse({ url: signedUrl }, "Template ready.", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/bulk/store — validates each
 * row of the uploaded XLSX through the beneficiary/sender normalizers;
 * every successful row enqueues a PayoutJob to the bulk-payout worker.
 * Mirror of the legacy payoutController.bulkStore.
 */
export const bulkStore = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (!(await passesTransactionTfa(req))) {
            return res.sendError(res.__("139"), 139, 400);
        }

        const buffer = extractUploadedFileBuffer(req);
        if (!buffer || buffer.length === 0) {
            return res.sendError(
                "Excel file (multipart 'file') required.",
                422,
                422,
            );
        }

        const body = req.body as {
            country?: string;
            currency?: string;
            type?: number | string;
            bank_account_id?: string;
            wallet_id?: string;
        };
        const country = String(body.country ?? "");
        const currency = String(body.currency ?? "");
        const type = Number(body.type ?? 1);

        // Resolve the funding source (wallet or virtual account) that the
        // per-row payouts will draw from.
        let sourceType: string | null = null;
        let sourceId: string | null = null;
        if (body.wallet_id) {
            const wallet = await Wallet.findOne({
                where: { uniqueId: body.wallet_id, userId: req.user.id },
            });
            if (wallet) {
                sourceType = MORPH_WALLET;
                sourceId = String(wallet.id);
            }
        } else if (body.bank_account_id) {
            const scope = await getVirtualAccountScope(req.user);
            const virtualAccount = await VirtualAccount.findOne({
                where: { ...scope, uniqueId: body.bank_account_id },
            });
            if (virtualAccount) {
                sourceType = MORPH_VIRTUAL_ACCOUNT;
                sourceId = String(virtualAccount.id);
            }
        }

        const beneficiary = await beneficiaryFormFields({
            country,
            currency,
            type,
            merchantId: req.user.merchantId,
        });
        const quote = await quoteFormFields();
        const merchantRow = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const enableSender = req.user.enableSender;
        const remitter = enableSender
            ? await senderFields({
                  type,
                  merchantId: merchantRow?.id ?? null,
                  remitterDepositEnabled: await isRemitterDepositEnabled(
                      req.user.merchantId,
                  ),
              })
            : [];

        const fields = flattenFormFields({ quote, beneficiary, remitter }, [
            "quote",
            "beneficiary",
            ...(enableSender ? ["remitter"] : []),
        ]);

        const remitterDepositEnabled = await isRemitterDepositEnabled(
            req.user.merchantId,
        );

        const result = await processExcel(
            buffer,
            fields,
            async (payload, rowNumber) => {
                payload.beneficiary.country = country;
                payload.beneficiary.currency = currency;

                const normalizedBeneficiary =
                    await validateAndNormalizeBeneficiary(
                        payload.beneficiary as Record<string, unknown>,
                        req.user!,
                    );
                let normalizedSender = null;
                if (enableSender) {
                    normalizedSender = await validateAndNormalizeSender(
                        payload.remitter as Record<string, unknown>,
                        req.user!,
                        remitterDepositEnabled,
                    );
                }

                return {
                    row: rowNumber,
                    beneficiary: normalizedBeneficiary,
                    remitter: normalizedSender,
                    amount: payload.quote.amount ?? "",
                    remarks: payload.quote.remarks ?? null,
                    txn_ref_no: payload.quote.txn_ref_no ?? null,
                };
            },
        );

        if (result.errors.length > 0) {
            return res.sendResponse(
                { errors: result.errors },
                "Bulk import failed.",
                200,
            );
        }

        const created: { row: number; payout_job_id: string }[] = [];
        for (let index = 0; index < result.validatedRows.length; index += 1) {
            const row = result.validatedRows[index];
            const job = await PayoutJob.create({
                uniqueId: generateUniqueId(24),
                userId: req.user.id,
                rowNumber: index + 1,
                amount: row.amount
                    ? new Decimal(String(row.amount)).toString()
                    : null,
                status: PAYOUT_JOB_STATUS_PENDING,
                payload: {
                    source: "bulk",
                    beneficiary: row.beneficiary,
                    remitter: row.remitter,
                    transaction: {
                        amount: row.amount,
                        remarks: row.remarks,
                        txn_ref_no: row.txn_ref_no,
                    },
                    creator: req.teamMember?.id
                        ? String(req.teamMember.id)
                        : null,
                    source_type: sourceType,
                    source_id: sourceId,
                },
            });

            await Dispatch.bulkPayout({
                payoutJobUniqueId: job.uniqueId,
                userId: String(req.user.id),
            });

            created.push({ row: index + 1, payout_job_id: job.uniqueId });
        }

        return res.sendResponse(
            { success: created, errors: [] },
            "Bulk import accepted.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/retry-job/:jobId — resets a FAILED payout job and
 * re-dispatches it through the bulk-payout queue.
 *
 * Legacy quirk preserved: the route is mounted without auth middleware
 * but the handler still requires req.user, so unauthenticated calls
 * (i.e. all of them on this public mount) get the 102 envelope —
 * byte-identical to the legacy service.
 */
export const retryJob = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const payoutJob = await PayoutJob.findOne({
            where: { uniqueId: String(req.params.jobId), userId: req.user.id },
        });
        if (!payoutJob) {
            return res.sendError("Payout job not found.", 174, 400);
        }
        if (payoutJob.status !== PAYOUT_JOB_STATUS_FAILED) {
            return res.sendError(
                "Payout job is not in failed state.",
                175,
                400,
            );
        }

        payoutJob.status = PAYOUT_JOB_STATUS_PENDING;
        payoutJob.errorMessage = null;
        payoutJob.attempts = 0;
        await payoutJob.save();

        await Dispatch.bulkPayout({
            payoutJobUniqueId: payoutJob.uniqueId,
            userId: String(req.user.id),
        });
        return res.sendResponse([], res.__("success.176"), 176);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/download — bulk payout list
 * export as PDF (default) or XLSX (?type=excel|xlsx), uploaded to S3
 * with a signed temporary URL in the response. Mirror of the legacy
 * payoutController.downloadList: the list filter set without
 * pagination, sending currency resolved through the quote's
 * polymorphic source (wallet or virtual account).
 */
export const downloadList = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const fileType = String(query.type ?? "pdf").toLowerCase();

        const memberContext = teamMemberContext(req);
        const { where, filterIncludes } = await buildListFilter(
            req.user,
            query as never,
            memberContext,
        );

        // Two-step fetch (ids first) so the filter joins can't conflict
        // with the display includes — same rows the legacy single
        // findMany returned.
        const idRows = (await BeneficiaryTransaction.findAll({
            where,
            include: filterIncludes,
            order: [["created_at", "DESC"]],
            attributes: ["id"],
            subQuery: false,
            raw: true,
        })) as unknown as { id: number }[];
        const rows =
            idRows.length === 0
                ? []
                : await BeneficiaryTransaction.findAll({
                      where: { id: { [Op.in]: idRows.map((row) => row.id) } },
                      include: [
                          {
                              model: BeneficiaryAccount,
                              as: "beneficiaryAccount",
                              required: false,
                              paranoid: false,
                          },
                          { model: Quote, as: "quotes", required: false },
                          {
                              model: Sender,
                              as: "senders",
                              required: false,
                              paranoid: false,
                          },
                      ],
                      order: [["created_at", "DESC"]],
                  });

        // Sending currency comes from the quote's polymorphic source.
        const walletIds: number[] = [];
        const virtualAccountIds: number[] = [];
        for (const row of rows) {
            const quote = row.quotes;
            if (!quote) {
                continue;
            }
            if (quote.sourceId) {
                if (
                    quote.sourceType === MORPH_WALLET ||
                    quote.sourceType === "wallet"
                ) {
                    walletIds.push(quote.sourceId);
                } else if (
                    quote.sourceType === MORPH_VIRTUAL_ACCOUNT ||
                    quote.sourceType === "virtual_account"
                ) {
                    virtualAccountIds.push(quote.sourceId);
                }
            }
            if (quote.virtualAccountId) {
                virtualAccountIds.push(quote.virtualAccountId);
            }
        }
        const [wallets, virtualAccounts] = await Promise.all([
            walletIds.length > 0
                ? Wallet.findAll({ where: { id: { [Op.in]: walletIds } } })
                : Promise.resolve([]),
            virtualAccountIds.length > 0
                ? VirtualAccount.findAll({
                      where: { id: { [Op.in]: virtualAccountIds } },
                  })
                : Promise.resolve([]),
        ]);
        const walletCurrencyMap = new Map(
            wallets.map((wallet) => [String(wallet.id), wallet.currency]),
        );
        const virtualAccountCurrencyMap = new Map(
            virtualAccounts.map((account) => [
                String(account.id),
                account.currency,
            ]),
        );
        const merchant = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;

        const toTitleCase = (value: string): string => {
            if (!value) {
                return "";
            }
            return value
                .toLowerCase()
                .split(/[\s_]+/)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");
        };

        const resolveSendingCurrency = (
            row: BeneficiaryTransaction,
        ): string => {
            const quote = row.quotes;
            if (!quote) {
                return "";
            }
            let sendingCurrency = "";
            if (quote.sourceId) {
                if (
                    quote.sourceType === MORPH_WALLET ||
                    quote.sourceType === "wallet"
                ) {
                    sendingCurrency =
                        walletCurrencyMap.get(String(quote.sourceId)) ?? "";
                } else if (
                    quote.sourceType === MORPH_VIRTUAL_ACCOUNT ||
                    quote.sourceType === "virtual_account"
                ) {
                    sendingCurrency =
                        virtualAccountCurrencyMap.get(
                            String(quote.sourceId),
                        ) ?? "";
                }
            }
            if (!sendingCurrency && quote.virtualAccountId) {
                sendingCurrency =
                    virtualAccountCurrencyMap.get(
                        String(quote.virtualAccountId),
                    ) ?? "";
            }
            return sendingCurrency;
        };

        let buffer: Buffer;
        let contentType: string;
        let extension: string;

        if (fileType === "excel" || fileType === "xlsx") {
            const exportRows = rows.map((row, index) => {
                const sendingCurrency = resolveSendingCurrency(row);

                let remitterName = "";
                if (row.senders) {
                    if (Number(row.senders.type) === 2) {
                        remitterName = row.senders.firstName ?? "";
                    } else {
                        remitterName = [
                            row.senders.firstName,
                            row.senders.lastName,
                        ]
                            .filter(Boolean)
                            .join(" ");
                    }
                } else if (merchant) {
                    remitterName = merchant.name;
                } else {
                    remitterName = [
                        req.user?.firstName,
                        req.user?.lastName,
                    ]
                        .filter(Boolean)
                        .join(" ");
                }

                let beneficiaryName = "";
                if (row.beneficiaryAccount) {
                    if (Number(row.beneficiaryAccount.type) === 2) {
                        beneficiaryName =
                            row.beneficiaryAccount.businessName ||
                            [
                                row.beneficiaryAccount.firstName,
                                row.beneficiaryAccount.lastName,
                            ]
                                .filter(Boolean)
                                .join(" ");
                    } else {
                        beneficiaryName = [
                            row.beneficiaryAccount.firstName,
                            row.beneficiaryAccount.lastName,
                        ]
                            .filter(Boolean)
                            .join(" ");
                    }
                }

                const statusText = beneficiaryTransactionStatusLabel(
                    Number(row.status),
                );

                let fxRateFormatted = "";
                if (
                    row.quotes?.fxRate &&
                    sendingCurrency &&
                    row.receivingCurrency
                ) {
                    fxRateFormatted = `1${sendingCurrency} = ${row.quotes.fxRate}${row.receivingCurrency}`;
                } else {
                    fxRateFormatted = row.quotes?.fxRate ?? "";
                }

                return {
                    "S. No.": index + 1,
                    "Transaction ID": row.txnRefNo ?? "",
                    "Client Ref No": row.clientReferenceId ?? "",
                    "Sending Amount": String(row.totalAmount),
                    "Sending Currency": sendingCurrency,
                    "Recipient Amount": row.recipientAmount
                        ? String(row.recipientAmount)
                        : "",
                    "Recipient Currency": row.receivingCurrency ?? "",
                    Fees: String(row.commissionAmount),
                    "FX Rate": fxRateFormatted,
                    "Remitter Name": remitterName,
                    "Beneficiary Name": beneficiaryName,
                    "Account Number":
                        row.beneficiaryAccount?.accountNumber ?? "",
                    Remarks: row.remarks ?? "",
                    Status: toTitleCase(statusText),
                    "Created At": row.createdAt
                        ? formatDateHuman(row.createdAt)
                        : "",
                };
            });

            buffer = await generateExcel(exportRows, {
                sheetTitle: "BeneficiaryTransactions",
            });
            contentType =
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            extension = "xlsx";
        } else {
            const translations: Record<string, string> = {
                beneficiary_transactions: "Beneficiary Transactions",
                s_no: "S.No",
                txn_ref_no: "Txn Ref No",
                client_ref_no: "Client Ref No",
                account_number: "Account Number",
                sending_amount: "Sending Amount",
                receiving_amount: "Receiving Amount",
                status: "Status",
                date: "Date",
            };
            const tr = (key: string) => translations[key] || key;

            const beneficiaryDetails = rows.map((row) => {
                const statusLabel = beneficiaryTransactionStatusLabel(
                    Number(row.status),
                    !!req.teamMember,
                );
                return {
                    txn_ref_no: row.txnRefNo ?? "",
                    client_ref_no: row.clientReferenceId ?? "",
                    account_number:
                        row.beneficiaryAccount?.accountNumber ?? "",
                    sending_amount: String(row.totalAmount),
                    receiving_amount: row.recipientAmount
                        ? String(row.recipientAmount)
                        : "",
                    receiving_currency: row.receivingCurrency ?? "",
                    status: statusLabel,
                    created_at: row.createdAt
                        ? new Date(row.createdAt).toISOString().split("T")[0]
                        : "",
                };
            });

            const html = await renderViewTemplate(
                "invoice/beneficiaryTransaction.ejs",
                {
                    tr,
                    date: formatReportDate(),
                    logo: loadLogoDataUrl(),
                    beneficiary_details: beneficiaryDetails,
                },
            );
            buffer = await renderPdfFromHtml(html);
            contentType = "application/pdf";
            extension = "pdf";
        }

        const key = await upload(
            { buffer, contentType, extension },
            "exports/beneficiary-transactions",
        );
        const signedUrl = await temporaryUrl(key);
        return res.sendResponse(
            { url: signedUrl },
            "Bulk export generated.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/beneficiary-transactions/export — single-transaction
 * PDF receipt, uploaded to S3 with a signed temporary URL in the
 * response. Mirror of the legacy payoutController.export
 * (BeneficiaryTransactionRepository::downloadReceipt): the transaction
 * resolves by any public identifier, the receipt renders through the
 * invoice.ejs template and prints to A4 via puppeteer.
 */
/**
 * Receipt locals for invoice/invoice.ejs — shared by the single
 * /export and the /export-multiple endpoints so every receipt carries
 * identical data regardless of which endpoint rendered it.
 */
const buildReceiptInvoiceDetails = async (
    user: User,
    transaction: BeneficiaryTransaction,
): Promise<Record<string, unknown>> => {
    const sender = transaction.senders ?? null;
    const userInfo = await UserInformation.findOne({
        where: { userId: user.id },
    });

    // Sender identity: the sender row when present, else the
    // merchant/business name, else the user's own name.
    let senderName = "";
    if (sender) {
        senderName =
            `${sender.firstName ?? ""} ${sender.lastName ?? ""}`.trim();
    } else {
        let resolvedBusinessName = "";
        if (user.merchantId) {
            const merchant = await Merchant.findByPk(user.merchantId);
            if (merchant?.name) {
                resolvedBusinessName = merchant.name;
            }
        }
        if (
            !resolvedBusinessName &&
            Number(user.userType) === USER_TYPE_BUSINESS
        ) {
            resolvedBusinessName = userInfo?.businessName ?? "";
        }
        senderName =
            resolvedBusinessName ||
            `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    }

    const beneficiaryAccount = transaction.beneficiaryAccount;
    const detail = beneficiaryAccount?.additionalDetails?.[0] ?? null;

    // Remarks fall back to the human label of the beneficiary's
    // purpose-of-transaction lookup.
    let finalRemarks = transaction.remarks ?? "";
    if (!finalRemarks && detail?.purposeOfTransaction) {
        finalRemarks =
            (await findValueByKey(detail.purposeOfTransaction)) ?? "";
    }

    const statusLabel = beneficiaryTransactionStatusLabel(
        transaction.status,
    );

    // Quote-side figures (send amount / fx / total) and the sending
    // currency resolved from the quote's funding source — used by the
    // A-Express receipt layout.
    const quote = transaction.quotes ?? null;
    let sendingCurrency = "";
    if (quote?.sourceId) {
        if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
            const sourceAccount = await VirtualAccount.findByPk(
                quote.sourceId,
            );
            sendingCurrency = sourceAccount?.currency ?? "";
        } else if (quote.sourceType === MORPH_WALLET) {
            const sourceWallet = await Wallet.findByPk(quote.sourceId);
            sendingCurrency = sourceWallet?.currency ?? "";
        }
    }

    // Source of funds: the sender's declared source first, else the
    // beneficiary detail's source-of-income lookup label.
    let sourceOfFunds = sender?.sourceOfFunds ?? "";
    if (!sourceOfFunds && detail?.userSourceOfIncome) {
        sourceOfFunds =
            (await findValueByKey(detail.userSourceOfIncome)) ?? "";
    }

    const joinMobile = (
        countryCode?: string | null,
        mobile?: string | null,
    ): string => {
        if (!mobile) {
            return "";
        }
        return countryCode ? `+${countryCode} ${mobile}` : mobile;
    };

    const beneficiaryAddress = [
        detail?.addressLine1,
        detail?.city,
        detail?.country,
    ]
        .filter(Boolean)
        .join(", ");

    return {
        unique_id: transaction.uniqueId,
        created_at: formatDateHuman(transaction.createdAt),
        txn_ref_no: transaction.txnRefNo ?? "",
        utr_no: transaction.externalReferenceId ?? "",
        client_reference_id: transaction.clientReferenceId ?? null,
        sending_currency: sendingCurrency,
        sending_amount: quote?.amount ? String(quote.amount) : "",
        total_sending_amount: quote?.totalSendingAmount
            ? String(quote.totalSendingAmount)
            : "",
        fx_rate: quote?.fxRate ? String(quote.fxRate) : "",
        commission_amount: transaction.commissionAmount
            ? String(transaction.commissionAmount)
            : "",
        source_of_funds: sourceOfFunds,
        sender_ic: sender?.idNumber ?? "",
        sender_mobile: joinMobile(
            sender?.mobileCountryCode ?? user.mobileCountryCode,
            sender?.mobile ?? user.mobile,
        ),
        beneficiary_account_no: beneficiaryAccount?.accountNumber ?? "",
        beneficiary_bank_name: beneficiaryAccount?.bankName ?? "",
        beneficiary_mobile: joinMobile(
            beneficiaryAccount?.mobileCountryCode,
            beneficiaryAccount?.mobile,
        ),
        beneficiary_address: beneficiaryAddress,
        sender_name: senderName,
        sender_address: sender?.address1 ?? userInfo?.address1 ?? "",
        sender_city: sender?.city ?? userInfo?.city ?? "",
        sender_state: sender?.state ?? userInfo?.state ?? "",
        sender_country: sender?.country ?? userInfo?.country ?? "",
        sender_postal_code:
            sender?.postalCode ?? userInfo?.postalCode ?? "",
        beneficiary_name:
            beneficiaryAccount?.businessName ||
            `${beneficiaryAccount?.firstName ?? ""} ${beneficiaryAccount?.lastName ?? ""}`.trim() ||
            "",
        account_number: beneficiaryAccount?.accountNumber ?? "",
        bank_name: beneficiaryAccount?.bankName ?? "",
        bank_code: beneficiaryAccount?.swiftCode ?? "",
        routing_number: beneficiaryAccount?.routingNumber ?? "",
        currency: transaction.receivingCurrency ?? "",
        amount: transaction.recipientAmount
            ? String(transaction.recipientAmount)
            : "",
        remarks: finalRemarks,
        purpose: transaction.purposeOfPayment ?? "",
        status: statusLabel,
    };
};

export const exportReceipt = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const transaction = await findTransactionByAnyId(req.user.id, {
            beneficiary_transaction_id: query.beneficiary_transaction_id,
            txn_ref_no: query.txn_ref_no,
            client_reference_id: query.client_reference_id,
        });
        if (!transaction) {
            return res.sendError("Transaction not found.", 124, 400);
        }

        // A-Express transactions use their dedicated receipt layout
        // (zero-margin A4 — the template's tables carry all spacing);
        // both locals are provided so either template resolves.
        const isAexReceipt = transaction.externalType === EXTERNAL_TYPE_AEX;
        const templateName = isAexReceipt
            ? "pdf/aexpress_receipt.ejs"
            : "invoice/invoice.ejs";
        const receiptDetails = await buildReceiptInvoiceDetails(
            req.user,
            transaction,
        );
        const html = await renderViewTemplate(templateName, {
            invoice_details: receiptDetails,
            receipt_details: receiptDetails,
            logo_data_url: loadLogoDataUrl(
                isAexReceipt ? "aexpress-logo.png" : undefined,
            ),
        });
        const buffer = await renderPdfFromHtml(
            html,
            isAexReceipt
                ? {
                      margin: {
                          top: "0px",
                          right: "0px",
                          bottom: "0px",
                          left: "0px",
                      },
                  }
                : {},
        );

        const key = await upload(
            { buffer, contentType: "application/pdf", extension: "pdf" },
            "exports/transaction-receipts",
        );
        const signedUrl = await temporaryUrl(key);
        return res.sendResponse(
            { url: signedUrl },
            "Transaction receipt generated.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/beneficiary-transactions/export-multiple (mirror of
 * the Laravel exportMultiple route; also mounted for team members).
 *
 * Multi-receipt variant of /export: accepts a
 * beneficiary_transaction_ids body field (array or comma-separated
 * string), renders one standalone PDF receipt per transaction, bundles
 * them into a zip (entries named <beneficiary name>-<transaction id>.pdf),
 * uploads the zip and responds with the signed temporary URL in the
 * same envelope as /export.
 */
export const exportMultipleReceipts = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const rawIds = ((req.body ?? {}) as Record<string, unknown>)
            .beneficiary_transaction_ids;
        const requestedIds = [
            ...new Set(
                (Array.isArray(rawIds)
                    ? rawIds.map((value) => String(value))
                    : String(rawIds ?? "").split(",")
                )
                    .map((value) => value.trim())
                    .filter(Boolean),
            ),
        ];
        if (requestedIds.length === 0) {
            return res.sendError(
                "The beneficiary transaction ids field is required.",
                422,
                422,
            );
        }

        const transactions: BeneficiaryTransaction[] = [];
        for (const transactionId of requestedIds) {
            const transaction = await findTransactionByAnyId(req.user.id, {
                beneficiary_transaction_id: transactionId,
            });
            if (transaction) {
                transactions.push(transaction);
            }
        }
        if (transactions.length === 0) {
            return res.sendError("Transaction not found.", 124, 400);
        }

        const zip = new JSZip();
        for (const transaction of transactions) {
            const invoiceDetails = await buildReceiptInvoiceDetails(
                req.user,
                transaction,
            );
            const isAexReceipt =
                transaction.externalType === EXTERNAL_TYPE_AEX;
            const templateName = isAexReceipt
                ? "pdf/aexpress_receipt.ejs"
                : "invoice/invoice.ejs";
            const html = await renderViewTemplate(templateName, {
                invoice_details: invoiceDetails,
                receipt_details: invoiceDetails,
                logo_data_url: loadLogoDataUrl(
                    isAexReceipt ? "aexpress-logo.png" : undefined,
                ),
            });
            const pdfBuffer = await renderPdfFromHtml(
                html,
                isAexReceipt
                    ? {
                          margin: {
                              top: "0px",
                              right: "0px",
                              bottom: "0px",
                              left: "0px",
                          },
                      }
                    : {},
            );

            // <beneficiary name>-<transaction id>.pdf, filesystem-safe.
            const beneficiaryName = String(
                invoiceDetails.beneficiary_name ?? "",
            )
                .replace(/[^A-Za-z0-9 _.-]/g, "")
                .trim();
            zip.file(
                `${beneficiaryName || "receipt"}-${transaction.uniqueId}.pdf`,
                pdfBuffer,
            );
        }
        const buffer = await zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
        });

        const key = await upload(
            { buffer, contentType: "application/zip", extension: "zip" },
            "exports/transaction-receipts",
        );
        const signedUrl = await temporaryUrl(key);
        return res.sendResponse(
            { url: signedUrl },
            "Transaction receipt generated.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
