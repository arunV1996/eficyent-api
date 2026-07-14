import Ledger from "../models/ledger.model";
import Quote from "../models/quote.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import { formatDateHuman } from "../utils/common.utils";
import {
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_DEPOSIT_TRANSACTION,
    MORPH_WALLET_TRANSACTION,
    PAID_TO_BENEFICIARY,
    PAID_TO_WALLET,
    TRANSACTION_TYPE_CREDIT,
} from "../utils/constants";

/**
 * Mirror of App\Http\Resources\LedgerResource (via the legacy
 * ledgerResource.ts) — the flat statement-row shape, including the
 * source-vs-wallet currency selection and the per-filter balance
 * substitutions.
 */

export interface LedgerDto {
    unique_id: string;
    transaction_id: string;
    client_reference_id: string;
    txn_ref_no: string;
    transaction_type: string;
    paid_to: number | string | null;
    amount: string;
    balance: string;
    refund_transaction_id: string;
    created_at: string;
}

export interface LedgerResourceOptions {
    wallet_id?: string;
    bank_account_id?: string;
}

export type EnrichedLedger = Ledger & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refundLedger?: { transaction?: any } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletTransaction?: any;
    // Overridden running balance (set by the list/show recompute).
    balanceOverride?: string;
};

export const ledgerToJSON = (
    ledger: EnrichedLedger,
    options: LedgerResourceOptions = {},
): LedgerDto => {
    const transaction = ledger.transaction;
    const effectiveBalance = ledger.balanceOverride ?? ledger.balance;

    const currency =
        ledger.wallet?.currency ?? ledger.virtualAccount?.currency ?? "";
    const fromCurrency = ledger.virtualAccount?.currency ?? currency;
    let displayCurrency = fromCurrency;
    if (options.wallet_id) {
        displayCurrency = currency;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let amount: any = transaction?.totalAmount ?? 0;
    let balanceString = effectiveBalance
        ? `${parseFloat(String(effectiveBalance)).toFixed(2)} ${currency}`.trim()
        : "";

    let type = "DEBIT";
    if (ledger.transactionType === MORPH_DEPOSIT_TRANSACTION) {
        type = "CREDIT";
    } else if (
        ledger.transactionType === MORPH_WALLET_TRANSACTION &&
        transaction
    ) {
        type =
            transaction.type === TRANSACTION_TYPE_CREDIT ? "CREDIT" : "DEBIT";
    }

    let paidTo: number | string | null = "";

    if (
        ledger.transactionType === MORPH_BENEFICIARY_TRANSACTION &&
        transaction
    ) {
        paidTo = PAID_TO_BENEFICIARY;
        if (options.wallet_id && ledger.walletTransaction) {
            balanceString = ledger.walletTransaction.balanceAfter
                ? `${parseFloat(String(ledger.walletTransaction.balanceAfter)).toFixed(2)} ${currency}`.trim()
                : balanceString;
        }
    }

    if (ledger.transactionType === MORPH_WALLET_TRANSACTION && transaction) {
        const walletTransaction = transaction as WalletTransaction & {
            quote?: Quote;
            wallet?: Wallet;
        };

        if (options.bank_account_id) {
            amount = walletTransaction.quote?.totalSendingAmount ?? amount;
        }

        if (options.wallet_id) {
            balanceString = walletTransaction.balanceAfter
                ? `${parseFloat(String(walletTransaction.balanceAfter)).toFixed(2)} ${currency}`.trim()
                : "";
        }

        if (options.bank_account_id) {
            balanceString = effectiveBalance
                ? `${parseFloat(String(effectiveBalance)).toFixed(2)} ${fromCurrency}`.trim()
                : "";
        }

        if (
            ledger.virtualAccountId &&
            ledger.walletId &&
            !options.wallet_id
        ) {
            type = "DEBIT";
        }

        paidTo = PAID_TO_WALLET;
    }

    // Refund transaction resolving.
    let refundId = "";
    if (ledger.refundLedgerId) {
        const refundTransaction = ledger.refundLedger?.transaction;
        refundId =
            refundTransaction?.clientReferenceId ||
            refundTransaction?.client_reference_id ||
            "";
    }

    // Client reference ID: the transaction's own, falling back to the
    // refund chain's.
    let clientReference = "";
    if (transaction) {
        clientReference =
            transaction.clientReferenceId ||
            transaction.client_reference_id ||
            "";
    }
    if (!clientReference) {
        clientReference = refundId;
    }

    let transactionReference = "";
    if (transaction) {
        transactionReference =
            transaction.txnRefNo || transaction.txn_ref_no || "";
    }

    const timezone = ledger.users?.timezone || "Asia/Kolkata";

    return {
        unique_id: ledger.uniqueId,
        transaction_id: transaction?.uniqueId || "",
        client_reference_id: clientReference,
        txn_ref_no: transactionReference,
        transaction_type: type,
        paid_to: type === "DEBIT" ? paidTo : "",
        amount: amount
            ? `${parseFloat(String(amount)).toFixed(2)} ${displayCurrency}`.trim()
            : "",
        balance: balanceString,
        refund_transaction_id: refundId,
        created_at: formatDateHuman(
            transaction?.createdAt || ledger.createdAt,
            timezone,
        ),
    };
};
