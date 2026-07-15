import Decimal from "decimal.js";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import {
    beneficiaryTransactionStatusLabel,
    depositTransactionStatusLabel,
} from "../utils/common.utils";

/**
 * Merchant-callback payload shapes (mirror of the legacy
 * services/callbacks/payloadBuilders.ts). These bodies are what the
 * SendCallback worker POSTs to the merchant's callback URL, so field
 * names and formatting must stay byte-identical.
 */

export const beneficiaryTransactionCallbackPayload = (
    transaction: BeneficiaryTransaction,
): Record<string, unknown> => {
    return {
        unique_id: transaction.uniqueId ?? "",
        txn_ref_no: transaction.txnRefNo ?? "",
        client_reference_id: transaction.clientReferenceId ?? "",
        utr_number: transaction.externalReferenceId ?? "",
        // Decimal normalization mirrors the Prisma Decimal .toString()
        // ("1000.500000" -> "1000.5") the legacy builder produced.
        total_amount:
            transaction.totalAmount !== null &&
            transaction.totalAmount !== undefined
                ? new Decimal(transaction.totalAmount).toString()
                : "",
        status: beneficiaryTransactionStatusLabel(transaction.status) ?? "",
        remarks: transaction.notes ?? "",
    };
};

export const depositTransactionCallbackPayload = (
    deposit: DepositTransaction,
): Record<string, unknown> => {
    const currency = (deposit.depositCurrency || "USD").toUpperCase();
    const typeLabel = deposit.type
        ? deposit.type.charAt(0).toUpperCase() +
          deposit.type.slice(1).toLowerCase()
        : "Topup";
    return {
        unique_id: deposit.uniqueId,
        memo: deposit.memo || "",
        amount: Number(deposit.amount || 0).toFixed(2),
        fee: `${Number(deposit.totalCommissionAmount || 0).toFixed(2)} ${currency}`,
        total_amount: Number(deposit.totalAmount || 0).toFixed(2),
        currency,
        type: typeLabel,
        purpose_of_payment: deposit.purposeOfPayment || "",
        source_of_funds: deposit.sourceOfFunds || "",
        status: depositTransactionStatusLabel(deposit.status),
        created_at:
            deposit.createdAt instanceof Date
                ? deposit.createdAt.toISOString()
                : new Date(deposit.createdAt || "").toISOString(),
    };
};
