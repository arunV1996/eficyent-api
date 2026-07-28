import Decimal from "decimal.js";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import {
    formatDateHuman,
    walletStatusLabel,
    walletTransactionStatusLabel,
} from "../utils/common.utils";
import {
    BUSINESS_MODEL_DEAL_BASED,
    BUSINESS_MODEL_MTO,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
} from "../utils/constants";
import { quoteToJSON, QuoteDto } from "./quote.resource";
import {
    virtualAccountToJSON,
    VirtualAccountDto,
} from "./virtual_account.resource";

/**
 * Mirror of the legacy walletResource.ts (WalletResource +
 * WalletTransactionResource). Balances are numbers rounded to two
 * decimals; the transaction resource keeps the legacy quirks —
 * generated transaction_id fallback and the conditional
 * virtual_account block for VirtualAccount-sourced quotes.
 */

export interface WalletDto {
    unique_id: string;
    currency: string;
    balance: number;
    business_model: string;
    status: string;
    created_at: string;
    flag: string | null;
}

export const walletToJSON = (
    wallet: Wallet & { balance?: string; flag?: string | null },
    timezone?: string,
): WalletDto => {
    return {
        unique_id: wallet.uniqueId,
        currency: wallet.currency,
        balance: Number(parseFloat(wallet.balance ?? "0").toFixed(2)),
        business_model:
            wallet.businessModel === BUSINESS_MODEL_DEAL_BASED
                ? BUSINESS_MODEL_DEAL_BASED
                : BUSINESS_MODEL_MTO,
        status: walletStatusLabel(wallet.status),
        created_at: wallet.createdAt
            ? formatDateHuman(wallet.createdAt, timezone)
            : "",
        flag: wallet.flag ?? null,
    };
};

export interface WalletTransactionDto {
    unique_id: string;
    wallet: WalletDto | object;
    quote: QuoteDto | object;
    amount: string;
    fees: string;
    total_amount: string;
    status: string;
    transaction_type: number;
    created_at: string;
    virtual_account?: VirtualAccountDto | null;
    transaction_id: string;
}

export const walletTransactionToJSON = (
    walletTransaction: WalletTransaction,
    timezone?: string,
): WalletTransactionDto => {
    const quote = walletTransaction.quote;
    const walletObject = walletTransaction.wallet
        ? walletToJSON(walletTransaction.wallet, timezone)
        : {};

    // Source-currency resolution mirrors the legacy resource exactly,
    // including the "USD" fallback for VirtualAccount sources whose
    // account row wasn't eager-loaded.
    let sourceCurrency: string | undefined;
    if (quote) {
        if (quote.virtual_accounts?.currency) {
            sourceCurrency = quote.virtual_accounts.currency;
        } else if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
            sourceCurrency = "USD";
        } else if (
            quote.sourceType === MORPH_WALLET &&
            walletTransaction.wallet?.currency
        ) {
            sourceCurrency = walletTransaction.wallet.currency;
        }
    }

    const quoteObject = quote
        ? quoteToJSON(quote, sourceCurrency, timezone)
        : {};

    // Legacy quirk preserved: rows persisted before the transaction_id
    // column existed get a synthesized id from the row's own creation
    // time + the quote fx rate digits.
    let transactionId = walletTransaction.transactionId || "";
    if (!transactionId) {
        const randomPart = Math.floor(Math.random() * 900) + 100;
        const referenceDate = walletTransaction.createdAt
            ? new Date(walletTransaction.createdAt)
            : new Date();
        const datePart =
            referenceDate.getFullYear() +
            String(referenceDate.getMonth() + 1).padStart(2, "0") +
            String(referenceDate.getDate()).padStart(2, "0") +
            String(referenceDate.getHours()).padStart(2, "0") +
            String(referenceDate.getMinutes()).padStart(2, "0") +
            String(referenceDate.getSeconds()).padStart(2, "0");
        const fxPart = quote ? (quote.fxRate || "").replace(/\./g, "") : "";
        transactionId = `${randomPart}${datePart}${fxPart}`;
    }

    const dto: WalletTransactionDto = {
        unique_id: walletTransaction.uniqueId,
        wallet: walletObject,
        quote: quoteObject,
        // decimal.js toString() mirrors Prisma's Decimal.toString()
        // normalization ("100.00" -> "100").
        amount: new Decimal(walletTransaction.amount).toString(),
        fees: new Decimal(walletTransaction.fees).toString(),
        total_amount: new Decimal(walletTransaction.totalAmount).toString(),
        status: walletTransactionStatusLabel(walletTransaction.status),
        transaction_type: walletTransaction.type,
        created_at: formatDateHuman(walletTransaction.createdAt, timezone),
        transaction_id: transactionId,
    };

    if (
        quote &&
        quote.sourceType === MORPH_VIRTUAL_ACCOUNT &&
        quote.virtual_accounts
    ) {
        dto.virtual_account = virtualAccountToJSON(
            quote.virtual_accounts,
            undefined,
            "",
            timezone,
        );
    }

    return dto;
};
