import Decimal from "decimal.js";
import { findValueByKey, getStateName } from "../helpers/lookup.helper";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionProof from "../models/beneficiary_transaction_proof.model";
import Sender from "../models/sender.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import { temporaryUrl } from "../services/s3.service";
import {
    beneficiaryTransactionStatusLabel,
    formatDateHuman,
} from "../utils/common.utils";
import { LOOKUP_TYPE_ID_TYPE } from "../utils/constants";
import {
    beneficiaryAccountToJSON,
    filterEmptyValues,
} from "./beneficiary_account.resource";

/**
 * Mirror of App\Http\Resources\BeneficiaryTransactionResource (via the
 * legacy beneficiaryTransactionResource.ts). Field order, formatting
 * (2-decimal strings, "1 USD = 83.2 INR" fx strings, humanized dates in
 * the user's timezone) and the recursive empty-value filtering are all
 * preserved so the JSON is byte-identical.
 */

const safeTemporaryUrl = async (
    url: string | null | undefined,
): Promise<string> => {
    if (!url) {
        return "";
    }
    try {
        return await temporaryUrl(url);
    } catch {
        return url;
    }
};

const remitterStatusLabel = (status: number): string => {
    switch (status) {
        case 0:
            return "PENDING";
        case 1:
            return "APPROVED";
        case 2:
            return "REJECTED";
        case 3:
            return "EXPIRED";
        case 4:
            return "DISABLED";
        default:
            return "";
    }
};

const transactionProofStatusLabel = (status: number): string => {
    switch (status) {
        case 1:
            return "REQUESTED";
        case 2:
            return "PROVIDED";
        case 3:
            return "REJECTED";
        default:
            return "";
    }
};

/**
 * Mirror of TransactionProofResource.
 */
export const transactionProofToJSON = async (
    proof: BeneficiaryTransactionProof,
    transactionUniqueId: string,
    timezone?: string,
): Promise<Record<string, unknown>> => {
    const resolvedTimezone = timezone || "Asia/Kolkata";
    return {
        transaction_id: transactionUniqueId,
        status: proof.status ? transactionProofStatusLabel(proof.status) : "",
        file: proof.fileUrl ? await safeTemporaryUrl(proof.fileUrl) : "",
        remitter_proof: proof.remitterProof
            ? await safeTemporaryUrl(proof.remitterProof)
            : "",
        requested_at: proof.requestedAt
            ? formatDateHuman(proof.requestedAt, resolvedTimezone)
            : "",
    };
};

const shapeRemitter = async (
    sender: Sender,
    userTimezone: string,
): Promise<Record<string, unknown>> => {
    const isRemitterBusiness = Number(sender.type) === 2;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remitterData: any = {
        unique_id: sender.uniqueId,
        type: isRemitterBusiness ? "BUSINESS" : "PERSONAL",
        first_name: sender.firstName ?? "",
        last_name: sender.lastName ?? "",
        middle_name: sender.middleName ?? "",
        email: sender.email ?? "",
        mobile_country_code: sender.mobileCountryCode ?? "",
        mobile: sender.mobile ?? "",
        address: sender.address1 ?? "",
        country: sender.country ?? "",
        nationality: sender.nationality ?? "",
        city: sender.city ?? "",
        state: sender.state
            ? await getStateName(sender.state, sender.country)
            : "",
        postal_code: sender.postalCode ?? "",
        source_of_funds: sender.sourceOfFunds
            ? await findValueByKey(sender.sourceOfFunds)
            : "",
        id_type: sender.idType
            ? await findValueByKey(sender.idType, LOOKUP_TYPE_ID_TYPE)
            : "",
        id_number: sender.idNumber ?? "",
        status: remitterStatusLabel(sender.status),
        created_at: formatDateHuman(sender.createdAt, userTimezone),
    };

    if (sender.clientReferenceId) {
        remitterData.client_reference_id = sender.clientReferenceId;
    }
    if (sender.dob) {
        const dateOfBirth =
            typeof sender.dob === "string" ? new Date(sender.dob) : sender.dob;
        if (
            dateOfBirth instanceof Date &&
            !Number.isNaN(dateOfBirth.getTime())
        ) {
            remitterData.dob = dateOfBirth.toISOString().split("T")[0];
        } else {
            remitterData.dob = String(sender.dob);
        }
    }

    if (isRemitterBusiness) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const businessPersonsRaw = sender.businessPersons as any[];
        const businessPersons = [];
        if (Array.isArray(businessPersonsRaw)) {
            for (const person of businessPersonsRaw) {
                const shapedPerson = { ...person };
                if (shapedPerson.id_type) {
                    shapedPerson.id_type = await findValueByKey(
                        shapedPerson.id_type,
                    );
                }
                if (shapedPerson.designation) {
                    shapedPerson.designation = await findValueByKey(
                        shapedPerson.designation,
                    );
                }
                businessPersons.push(shapedPerson);
            }
        }

        remitterData.business_name = sender.firstName ?? "";
        remitterData.business_persons = businessPersons;

        const proofs = [];
        if (sender.documents) {
            for (const document of sender.documents) {
                proofs.push({
                    document_name: document.documentName ?? "",
                    document_type: document.documentType ?? "",
                    document_country: document.documentCountry ?? "",
                    document_file: document.documentFile
                        ? await safeTemporaryUrl(document.documentFile)
                        : "",
                });
            }
        }
        remitterData.proofs = proofs;

        delete remitterData.first_name;
        delete remitterData.last_name;
        delete remitterData.middle_name;
    }

    return remitterData;
};

export const beneficiaryTransactionToJSON = async (
    transaction: BeneficiaryTransaction,
    isTeam = false,
): Promise<Record<string, unknown>> => {
    const userTimezone = transaction.users?.timezone ?? "Asia/Kolkata";
    const statusLabel = beneficiaryTransactionStatusLabel(
        transaction.status,
        isTeam,
    );
    const quote = transaction.quotes;

    // Resolve the source currency from the quote's polymorphic source.
    let sourceCurrency = "USD";
    if (quote && quote.sourceType && quote.sourceId) {
        try {
            if (quote.sourceType.includes("Wallet")) {
                const wallet = await Wallet.findOne({
                    where: { id: quote.sourceId },
                    attributes: ["currency"],
                });
                if (wallet?.currency) {
                    sourceCurrency = wallet.currency;
                }
            } else if (quote.sourceType.includes("VirtualAccount")) {
                const virtualAccount = await VirtualAccount.findOne({
                    where: { id: quote.sourceId },
                    attributes: ["currency"],
                });
                if (virtualAccount?.currency) {
                    sourceCurrency = virtualAccount.currency;
                }
            }
        } catch {
            // Ignored — fall through to the default.
        }
    } else if (quote?.receivingCurrency) {
        sourceCurrency = quote.receivingCurrency;
    }

    // Quote DTO
    let quoteDto: Record<string, unknown> | null = null;
    if (quote) {
        const recipientType =
            quote.recipientType === 2 ? "BUSINESS" : "PERSONAL";
        const effectiveSourceCurrency =
            sourceCurrency ?? quote.receivingCurrency ?? "USD";
        const fxRateString =
            quote.fxRate && quote.fxRate !== "1"
                ? `1 ${effectiveSourceCurrency} = ${quote.fxRate} ${quote.receivingCurrency}`
                : `1 ${effectiveSourceCurrency} = 1 ${effectiveSourceCurrency}`;

        quoteDto = {
            unique_id: quote.uniqueId,
            sending_amount: new Decimal(quote.amount).toFixed(2),
            receiving_amount: new Decimal(quote.receivingAmount).toFixed(2),
            fees: new Decimal(quote.commissionAmount)
                .plus(quote.merchantCommissionAmount ?? 0)
                .plus(quote.externalCommissionAmount ?? 0)
                .toNumber(),
            total_amount: new Decimal(
                quote.totalSendingAmount ?? quote.amount,
            ).toFixed(2),
            fx_rate: fxRateString,
            quote_type: quote.quoteType,
            recipient_type: recipientType,
            recipient_country: quote.recipientCountry ?? "",
            receiving_currency: quote.receivingCurrency ?? "",
            payment_rail: quote.paymentRail ?? "",
            expires_at: formatDateHuman(quote.expiresAt, userTimezone),
        };
    }

    // created_by: team member first, then the (pre-loaded) user, then a
    // fallback fetch when the relationship wasn't eager-loaded.
    let createdBy = "";
    if (transaction.team_members?.uniqueId) {
        createdBy = transaction.team_members.uniqueId;
    } else if (transaction.users?.uniqueId) {
        createdBy = transaction.users.uniqueId;
    } else if (transaction.userId) {
        try {
            const creatorUser = await User.findByPk(transaction.userId, {
                attributes: ["uniqueId"],
            });
            if (creatorUser?.uniqueId) {
                createdBy = creatorUser.uniqueId;
            }
        } catch {
            // Ignored — created_by stays "".
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dto: any = {
        unique_id: transaction.uniqueId,
        txn_ref_no: transaction.txnRefNo ?? "",
        utr_number: transaction.externalReferenceId ?? "",
        beneficiary_account: transaction.beneficiaryAccount
            ? await beneficiaryAccountToJSON(transaction.beneficiaryAccount)
            : {},
        quote: quoteDto ?? {},
        amount: new Decimal(transaction.amount).toFixed(2),
        commission_amount: new Decimal(transaction.commissionAmount).toFixed(
            2,
        ),
        total_amount: new Decimal(transaction.totalAmount).toFixed(2),
        sending_currency: sourceCurrency,
        recipient_amount: new Decimal(
            transaction.recipientAmount ?? 0,
        ).toFixed(2),
        receiving_currency: transaction.receivingCurrency ?? "",
        remarks: transaction.remarks ?? "",
        notes: transaction.notes ?? "",
        supporting_document: transaction.supportingDocument
            ? await safeTemporaryUrl(transaction.supportingDocument)
            : "",
        status: statusLabel,
        created_by: createdBy,
        created_at: formatDateHuman(transaction.createdAt, userTimezone),
    };

    if (transaction.senders) {
        dto.remitter = await shapeRemitter(transaction.senders, userTimezone);
    }

    if (transaction.clientReferenceId) {
        dto.client_reference_id = transaction.clientReferenceId;
    }

    if (transaction.purposeOfPayment) {
        dto.purpose_of_payment = await findValueByKey(
            transaction.purposeOfPayment,
        );
    }

    if (transaction.proofs && transaction.proofs.length > 0) {
        const firstProof = transaction.proofs[0];
        if (firstProof) {
            dto.transaction_proof = await transactionProofToJSON(
                firstProof,
                transaction.uniqueId,
                userTimezone,
            );
        }
    }

    // Strip empty branches recursively, then re-assert the three keys
    // the frontend expects to always be present (as empty strings).
    const filtered = filterEmptyValues(dto) ?? {};
    if (filtered.remarks === undefined) {
        filtered.remarks = "";
    }
    if (filtered.supporting_document === undefined) {
        filtered.supporting_document = "";
    }
    if (filtered.purpose_of_payment === undefined) {
        filtered.purpose_of_payment = "";
    }

    return filtered;
};

/**
 * Mirror of BeneficiaryTransactionCallbackResource — the slimmer view
 * served by /check_status and /check_external_service_status.
 */
export const beneficiaryTransactionCallbackToJSON = (
    transaction: BeneficiaryTransaction,
): Record<string, unknown> => {
    return {
        unique_id: transaction.uniqueId ?? "",
        txn_ref_no: transaction.txnRefNo ?? "",
        client_reference_id: transaction.clientReferenceId ?? "",
        utr_number: transaction.externalReferenceId ?? "",
        // decimal.js toString() mirrors Prisma's Decimal.toString()
        // normalization ("1000.500000" -> "1000.5").
        total_amount: transaction.totalAmount
            ? new Decimal(transaction.totalAmount).toString()
            : "",
        status: beneficiaryTransactionStatusLabel(transaction.status) ?? "",
        remarks: transaction.notes ?? "",
    };
};
