import DepositTransaction from "../models/deposit_transaction.model";
import { depositTransactionStatusLabel } from "../utils/common.utils";

/**
 * Merchant-callback payload shapes (mirror of the legacy
 * services/callbacks/payloadBuilders.ts). These bodies are what the
 * SendCallback worker POSTs to the merchant's callback URL, so field
 * names and formatting must stay byte-identical.
 */

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
