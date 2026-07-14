import { Request, Response } from "express";
import { Op } from "sequelize";
import {
    cancelTransactions,
    findTransactionByAnyId,
    listTransactions,
    updateTransactionStatus,
} from "../helpers/beneficiary_transaction.helper";
import { CodedError } from "../helpers/coded_error.helper";
import { createPayoutTransaction } from "../helpers/payout_transaction.helper";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionProof from "../models/beneficiary_transaction_proof.model";
import {
    beneficiaryTransactionCallbackToJSON,
    beneficiaryTransactionToJSON,
    transactionProofToJSON,
} from "../resources/beneficiary_transaction.resource";
import { uploadBase64 } from "../services/s3.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_APPROVAL_MAP,
    PAYMENT_PROOF_FIRA,
    PAYMENT_PROOF_REQUESTED,
    PAYMENT_PROOF_SWIFT,
    TAKE_COUNT,
} from "../utils/constants";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\BeneficiaryTransactionController (via the legacy
 * payoutController). This tranche ships the JSON surface: list, store,
 * show, check_transaction_status, check_status, cancel, update-status
 * and the transaction-proof pair.
 *
 * Deferred (documented per endpoint below where relevant):
 *   - /direct and /instant (need the sender normalizer)
 *   - /get-form-fields, /instant/get-form-fields,
 *     /transaction-form-fields (payout form-field builders)
 *   - /export, /download (puppeteer/EJS PDF + XLSX exports)
 *   - /bulk/template, /bulk/store (Excel import/export service)
 *   - public /retry-job, /retry_external_service,
 *     /check_external_service_status routes (need the provider
 *     clients + reverseRefund)
 *   - team-member token context (req.teamMember) — the team module is
 *     a later tranche, so creator context is always the user here.
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

        const { total, rows } = await listTransactions(req.user, {
            status: query.status,
            from_date: query.from_date,
            to_date: query.to_date,
            bank_account_id: query.bank_account_id,
            wallet_id: query.wallet_id,
            search_key: query.search_key,
            skip,
            take,
        });

        const beneficiaryTransactions = [];
        for (const row of rows) {
            beneficiaryTransactions.push(
                await beneficiaryTransactionToJSON(row),
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
        );

        return res.sendResponse(
            {
                beneficiary_transaction:
                    await beneficiaryTransactionToJSON(transaction),
            },
            res.__("s108"),
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
                beneficiary_transaction:
                    await beneficiaryTransactionToJSON(transaction),
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
                beneficiary_transaction:
                    await beneficiaryTransactionToJSON(transaction),
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
        return res.sendResponse([], res.__("s114"), 114);
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
            res.__("s115"),
            115,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
