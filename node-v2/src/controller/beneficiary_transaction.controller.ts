import { Request, Response } from "express";
import { Op } from "sequelize";
import { validateAndNormalizeBeneficiary } from "../helpers/beneficiary_normalizer.helper";
import {
    cancelTransactions,
    findTransactionByAnyId,
    listTransactions,
    updateTransactionStatus,
} from "../helpers/beneficiary_transaction.helper";
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
import { validateAndNormalizeSender } from "../helpers/sender_normalizer.helper";
import { teamMemberContext } from "../helpers/team_context.helper";
import { Dispatch } from "../jobs";
import { computeBankBalance, getWalletBalance } from "../helpers/balance.helper";
import { reverseRefund } from "../helpers/refund.helper";
import * as complianceService from "../services/compliance.service";
import * as processingUnitService from "../services/processing_unit.service";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionProof from "../models/beneficiary_transaction_proof.model";
import Ledger from "../models/ledger.model";
import Merchant from "../models/merchant.model";
import PayoutJob from "../models/payout_job.model";
import Quote from "../models/quote.model";
import Sender from "../models/sender.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import {
    beneficiaryTransactionCallbackToJSON,
    beneficiaryTransactionToJSON,
    transactionProofToJSON,
} from "../resources/beneficiary_transaction.resource";
import { uploadBase64 } from "../services/s3.service";
import { generateOrderId, generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_APPROVAL_MAP,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    PAYMENT_PROOF_FIRA,
    PAYMENT_PROOF_REQUESTED,
    PAYMENT_PROOF_SWIFT,
    PAYOUT_JOB_STATUS_FAILED,
    PAYOUT_JOB_STATUS_PENDING,
    TAKE_COUNT,
} from "../utils/constants";
import Decimal from "decimal.js";

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
 * Deferred (documented per endpoint below where relevant):
 *   - /export, /download (puppeteer/EJS PDF + XLSX exports)
 *   - /bulk/template, /bulk/store (Excel import/export service)
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
    let paymentType: "C2C" | "C2B" | "B2C" | "B2B" = "C2C";
    if (
        typeToken === "C2C" ||
        typeToken === "C2B" ||
        typeToken === "B2C" ||
        typeToken === "B2B"
    ) {
        paymentType = typeToken;
    } else if (
        typeToken === "1" ||
        typeToken === "INDIVIDUAL" ||
        typeToken === "PERSONAL"
    ) {
        paymentType = "C2C";
    } else if (typeToken === "2" || typeToken === "BUSINESS") {
        paymentType = "C2B";
    }
    const partyMap: Record<
        typeof paymentType,
        { beneficiary_type: 1 | 2; remitter_type: 1 | 2 }
    > = {
        C2C: { beneficiary_type: 1, remitter_type: 1 },
        C2B: { beneficiary_type: 1, remitter_type: 2 },
        B2C: { beneficiary_type: 2, remitter_type: 1 },
        B2B: { beneficiary_type: 2, remitter_type: 2 },
    };
    return { payment_type: paymentType, ...partyMap[paymentType] };
};

/**
 * Nulls out placeholder junk ("", "undefined", "null", "n/a") before a
 * value lands in a DB column — mirror of the legacy cleanDbField.
 */
const cleanDbField = (value: unknown): string | null => {
    if (value === null || value === undefined) {
        return null;
    }
    const stringValue = String(value).trim();
    const lowered = stringValue.toLowerCase();
    if (
        lowered === "" ||
        lowered === "undefined" ||
        lowered === "null" ||
        lowered === "n/a" ||
        lowered === "na"
    ) {
        return null;
    }
    return stringValue;
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
        // (email, account number, currency); otherwise create the
        // account + additional-detail pair.
        const beneficiaryEmail = cleanDbField(
            beneficiary.beneficiaryAccount.email,
        );
        const accountNumber = cleanDbField(
            beneficiary.beneficiaryAccount.account_number,
        );
        const currency = String(beneficiary.beneficiaryAccount.currency ?? "");
        let beneficiaryAccount = beneficiaryEmail
            ? await BeneficiaryAccount.findOne({
                  where: {
                      userId: req.user.id,
                      email: beneficiaryEmail,
                      accountNumber,
                      currency,
                  },
              })
            : null;
        if (!beneficiaryAccount) {
            beneficiaryAccount = await BeneficiaryAccount.create({
                uniqueId: generateUniqueId(24),
                userId: req.user.id,
                type:
                    typeof beneficiary.beneficiaryAccount.type === "number"
                        ? beneficiary.beneficiaryAccount.type
                        : null,
                country: String(
                    beneficiary.beneficiaryAccount.country ?? "US",
                ),
                currency,
                firstName: cleanDbField(
                    beneficiary.beneficiaryAccount.first_name,
                ),
                middleName: cleanDbField(
                    beneficiary.beneficiaryAccount.middle_name,
                ),
                lastName: cleanDbField(
                    beneficiary.beneficiaryAccount.last_name,
                ),
                email: beneficiaryEmail,
                mobileCountryCode: cleanDbField(
                    beneficiary.beneficiaryAccount.mobile_country_code,
                ),
                mobile: cleanDbField(beneficiary.beneficiaryAccount.mobile),
                accountNumber,
                accountName: cleanDbField(
                    beneficiary.beneficiaryAccount.account_name,
                ),
                bankName: cleanDbField(
                    beneficiary.beneficiaryAccount.bank_name,
                ),
                paymentRail: cleanDbField(
                    beneficiary.beneficiaryAccount.payment_rail,
                ),
                routingNumber: cleanDbField(
                    beneficiary.beneficiaryAccount.routing_number,
                ),
                swiftCode: cleanDbField(
                    beneficiary.beneficiaryAccount.swift_code,
                ),
                iban: cleanDbField(beneficiary.beneficiaryAccount.iban),
                businessName: cleanDbField(
                    beneficiary.beneficiaryAccount.business_name,
                ),
                businessCountry: cleanDbField(
                    beneficiary.beneficiaryAccount.business_country,
                ),
                status: 1,
            });

            const additionalDetail =
                beneficiary.beneficiaryAccountAdditionalDetail;
            await BeneficiaryAdditionalDetail.create({
                uniqueId: generateUniqueId(24),
                beneficiaryAccountId: beneficiaryAccount.id,
                addressType:
                    cleanDbField(additionalDetail.address_type) ?? "PRESENT",
                addressLine1: cleanDbField(additionalDetail.address_line1),
                addressLine2: cleanDbField(additionalDetail.address_line2),
                postalCode: cleanDbField(additionalDetail.postal_code),
                city: cleanDbField(additionalDetail.city),
                state: cleanDbField(additionalDetail.state),
                country: cleanDbField(additionalDetail.country),
                paymentType: cleanDbField(additionalDetail.payment_type),
                bankAddressLine1: cleanDbField(
                    additionalDetail.bank_address_line1,
                ),
                bankAddressLine2: cleanDbField(
                    additionalDetail.bank_address_line2,
                ),
                bankPostalCode: cleanDbField(
                    additionalDetail.bank_postal_code,
                ),
                bankCity: cleanDbField(additionalDetail.bank_city),
                bankState: cleanDbField(additionalDetail.bank_state),
                bankCountry: cleanDbField(additionalDetail.bank_country),
                purposeOfTransaction: cleanDbField(
                    additionalDetail.purpose_of_transaction,
                ),
                userSourceOfIncome: cleanDbField(
                    additionalDetail.user_source_of_income,
                ),
            });
        }

        // Sender upsert: reuse by id_number, otherwise create.
        const senderIdNumber = cleanDbField(sender.id_number);
        let senderRow = senderIdNumber
            ? await Sender.findOne({
                  where: { userId: req.user.id, idNumber: senderIdNumber },
              })
            : null;
        if (!senderRow) {
            let dateOfBirth: Date | null = null;
            if (sender.dob) {
                const parsedDob = new Date(sender.dob as string);
                if (!Number.isNaN(parsedDob.getTime())) {
                    dateOfBirth = parsedDob;
                }
            }

            senderRow = await Sender.create({
                uniqueId: generateUniqueId(24),
                userId: req.user.id,
                firstName: cleanDbField(sender.first_name),
                middleName: cleanDbField(sender.middle_name),
                lastName: cleanDbField(sender.last_name),
                email: cleanDbField(sender.email),
                mobileCountryCode: cleanDbField(sender.mobile_country_code),
                mobile: cleanDbField(sender.mobile),
                dob: dateOfBirth,
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
                businessPersons: sender.business_persons ?? null,
                status: 1,
            });
        }

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
            res.__("s108"),
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
        return res.sendResponse([], res.__("s112"), 112);
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

        return res.sendResponse([], res.__("s118"), 118);
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
        return res.sendResponse([], res.__("s176"), 176);
    } catch (error) {
        return sendCodedError(res, error);
    }
};
