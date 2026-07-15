import Decimal from "decimal.js";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Merchant from "../models/merchant.model";
import Quote from "../models/quote.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import { beneficiaryTransactionStatusLabel } from "../utils/common.utils";
import { MORPH_VIRTUAL_ACCOUNT, MORPH_WALLET } from "../utils/constants";
import { call } from "./http_client.service";

/**
 * Telegram ops notifier (mirror of the legacy
 * services/external/telegram.ts). Fire-and-forget: every entry point
 * swallows failures — a Telegram outage must never affect an API
 * response.
 *
 * Configuration comes from the environment (the legacy service reads
 * the same keys from its EXTERNAL_TELEGRAM_* secret/env bundle):
 *   EXTERNAL_TELEGRAM_BOT_TOKEN         bot token
 *   EXTERNAL_TELEGRAM_CHAT_ID           default ops channel
 *   EXTERNAL_TELEGRAM_CALLBACK_CHAT_ID  optional callback channel
 *   EXTERNAL_TELEGRAM_ENABLED           "false" disables the notifier
 *
 * Ported so far: the two notifications the API fires directly
 * (payout created / status changed + deposit received). The
 * worker/webhook-side notifications (PU failure, callback received,
 * user report alert) arrive with their tranches.
 */

interface TelegramConfig {
    botToken: string;
    chatId: string;
    callbackChatId?: string;
    enabled: boolean;
}

const loadConfig = (): TelegramConfig | null => {
    const botToken = process.env.EXTERNAL_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.EXTERNAL_TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        return null;
    }
    return {
        botToken,
        chatId,
        callbackChatId: process.env.EXTERNAL_TELEGRAM_CALLBACK_CHAT_ID,
        enabled: String(process.env.EXTERNAL_TELEGRAM_ENABLED) !== "false",
    };
};

const escapeHtml = (value: unknown): string => {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
};

const sendRaw = async (
    text: string,
    chatId: string,
    config: TelegramConfig,
): Promise<void> => {
    try {
        await call(
            { provider: "telegram", callFor: "callback" },
            {
                method: "POST",
                baseUrl: `https://api.telegram.org/bot${config.botToken}`,
                path: "/sendMessage",
                body: {
                    chat_id: chatId,
                    text,
                    parse_mode: "HTML",
                },
                timeoutMs: 10_000,
                retries: 1,
            },
        );
    } catch (sendError) {
        // eslint-disable-next-line no-console
        console.warn("Telegram send failed:", sendError);
    }
};

/**
 * Merchant-scoped channel routing: merchants with a telegram_channel
 * get their own channel, everyone else lands in the default one.
 */
const getChatIdForUser = async (
    userId: number | null | undefined,
    defaultChatId: string,
): Promise<string> => {
    if (!userId) {
        return defaultChatId;
    }
    try {
        const user = await User.findByPk(userId, {
            attributes: ["merchantId"],
        });
        if (user?.merchantId) {
            const merchant = await Merchant.findByPk(user.merchantId, {
                attributes: ["telegramChannel"],
                paranoid: false,
            });
            if (merchant?.telegramChannel) {
                return merchant.telegramChannel;
            }
        }
    } catch {
        // Ignored — fall through to the default channel.
    }
    return defaultChatId;
};

interface BeneficiaryTransactionMessage {
    user: string;
    from_amount: string;
    from_currency: string;
    to_amount: string;
    to_currency: string;
    fx_rate: string;
    status: string;
    created_at: string;
}

const formatBeneficiaryTransaction = (
    message: BeneficiaryTransactionMessage,
): string => {
    return [
        `Transaction From <b>${escapeHtml(message.user)}</b>`,
        ``,
        `<b>From Amount :</b> ${escapeHtml(message.from_amount)} ${escapeHtml(message.from_currency)}`,
        `<b>To Amount :</b> ${escapeHtml(message.to_amount)} ${escapeHtml(message.to_currency)}`,
        `<b>Exchange Rate :</b> 1 ${escapeHtml(message.from_currency)} = ${escapeHtml(message.fx_rate)} ${escapeHtml(message.to_currency)}`,
        `<b>Status :</b> ${escapeHtml(message.status)}`,
        `<b>Date :</b> ${escapeHtml(message.created_at)}`,
    ].join("\n");
};

export interface DepositMessage {
    id: string;
    user: string;
    amount: string;
    currency: string;
    status: string;
    created_at: string;
    channel?: string | null;
}

const formatDeposit = (message: DepositMessage): string => {
    return [
        `<b>Deposit Received</b>`,
        ``,
        `Txn ID: <code>${escapeHtml(message.id)}</code>`,
        `User: <b>${escapeHtml(message.user)}</b>`,
        `Amount: <b>${escapeHtml(message.amount)} ${escapeHtml(message.currency)}</b>`,
        `Status: <b>${escapeHtml(message.status)}</b>`,
        `Time: <b>${escapeHtml(message.created_at)}</b>`,
    ].join("\n");
};

/**
 * Mirror of TelegramNotifier.notifyBeneficiaryTransaction — resolves
 * the transaction with its user + quote and posts the ops summary.
 */
export const notifyBeneficiaryTransaction = async (
    beneficiaryTransactionId: number,
): Promise<void> => {
    try {
        const config = loadConfig();
        if (!config || !config.enabled) {
            return;
        }

        const transaction = await BeneficiaryTransaction.findByPk(
            beneficiaryTransactionId,
            {
                include: [
                    { model: User, as: "users", required: false },
                    { model: Quote, as: "quotes", required: false },
                ],
            },
        );
        if (!transaction || !transaction.users || !transaction.quotes) {
            return;
        }

        let fromCurrency = "";
        if (transaction.quotes.sourceType === MORPH_VIRTUAL_ACCOUNT) {
            const virtualAccount = await VirtualAccount.findByPk(
                transaction.quotes.sourceId!,
            );
            if (virtualAccount) {
                fromCurrency = virtualAccount.currency;
            }
        } else if (transaction.quotes.sourceType === MORPH_WALLET) {
            const wallet = await Wallet.findByPk(transaction.quotes.sourceId!);
            if (wallet) {
                fromCurrency = wallet.currency;
            }
        }

        const transactionUser = transaction.users;
        const message: BeneficiaryTransactionMessage = {
            user: transactionUser.firstName
                ? `${transactionUser.firstName} ${transactionUser.lastName ?? ""}`.trim()
                : transactionUser.email,
            from_amount: new Decimal(transaction.totalAmount).toString(),
            from_currency: fromCurrency,
            to_amount:
                transaction.recipientAmount !== null
                    ? new Decimal(transaction.recipientAmount).toString()
                    : "",
            to_currency: transaction.receivingCurrency ?? "",
            fx_rate: transaction.quotes.fxRate ?? "",
            status: beneficiaryTransactionStatusLabel(transaction.status),
            created_at: transaction.createdAt
                ? transaction.createdAt.toISOString()
                : "",
        };

        const chatId = await getChatIdForUser(
            transactionUser.id,
            config.chatId,
        );
        await sendRaw(formatBeneficiaryTransaction(message), chatId, config);
    } catch (notifyError) {
        // eslint-disable-next-line no-console
        console.warn("Telegram notifyBeneficiaryTransaction failed:", notifyError);
    }
};

/**
 * Mirror of TelegramNotifier.depositReceived.
 */
export const depositReceived = async (
    message: DepositMessage,
): Promise<void> => {
    try {
        const config = loadConfig();
        if (!config || !config.enabled) {
            return;
        }
        const deposit = await DepositTransaction.findOne({
            where: { uniqueId: message.id },
            attributes: ["userId"],
        });
        const defaultChat = message.channel ?? config.chatId;
        const chatId = deposit
            ? await getChatIdForUser(deposit.userId, defaultChat)
            : defaultChat;
        await sendRaw(formatDeposit(message), chatId, config);
    } catch (notifyError) {
        // eslint-disable-next-line no-console
        console.warn("Telegram depositReceived failed:", notifyError);
    }
};

export interface CallbackReceivedMessage {
    provider: string;
    payload: unknown;
    channel?: string;
}

/**
 * Mirror of TelegramNotifier.callbackReceived — announces every inbound
 * provider webhook to the ops callback channel (falls back to the
 * default channel when no callback channel is configured).
 */
export const callbackReceived = async (
    message: CallbackReceivedMessage,
): Promise<void> => {
    try {
        const config = loadConfig();
        if (!config || !config.enabled) {
            return;
        }
        const text = `<b>Callback received</b> [${escapeHtml(message.provider)}]\n\n<pre>${escapeHtml(
            JSON.stringify(message.payload).slice(0, 3500),
        )}</pre>`;
        await sendRaw(
            text,
            message.channel ?? config.callbackChatId ?? config.chatId,
            config,
        );
    } catch (notifyError) {
        // eslint-disable-next-line no-console
        console.warn("Telegram callbackReceived failed:", notifyError);
    }
};
