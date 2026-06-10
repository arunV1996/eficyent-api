import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";


interface TelegramSecret extends Record<string, unknown> {
  BOT_TOKEN: string;
  CHAT_ID: string;
  CALLBACK_CHAT_ID?: string;
  ENABLED?: boolean;
}

let cachedSecret: TelegramSecret | null = null;
async function loadSecret(): Promise<TelegramSecret | null> {
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = await Secrets.external<TelegramSecret>("telegram");
    return cachedSecret;
  } catch (err) {
    logger.warn({ err }, "Telegram secret missing - notifier disabled");
    return null;
  }
}

export const TelegramEvent = {
  BENEFICIARY_TRANSACTION_CREATED: "beneficiary_transaction_created",
  DEPOSIT_RECEIVED: "deposit_received",
  CALLBACK_RECEIVED: "callback_received",
  USER_REPORT_ALERT: "user_report_alert",
  PROCESSING_UNIT_INITIATION_FAILED: "processing_unit_initiation_failed",
} as const;

export type TelegramEventName = (typeof TelegramEvent)[keyof typeof TelegramEvent];

async function sendRaw(
  text: string,
  chatId: string,
  secret: TelegramSecret,
): Promise<void> {
  try {
    await call(
      { provider: "telegram", callFor: "callback" },
      {
        method: "POST",
        baseUrl: `https://api.telegram.org/bot${secret.BOT_TOKEN}`,
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
  } catch (err) {
    logger.warn({ err }, "Telegram send failed");
  }
}

function escape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBeneficiaryTransaction(payload: BeneficiaryTransactionPayload): string {
  return [
    `Transaction From <b>${escape(payload.user)}</b>`,
    ``,
    `<b>From Amount :</b> ${escape(payload.from_amount)} ${escape(payload.from_currency)}`,
    `<b>To Amount :</b> ${escape(payload.to_amount)} ${escape(payload.to_currency)}`,
    `<b>Exchange Rate :</b> 1 ${escape(payload.from_currency)} = ${escape(payload.fx_rate)} ${escape(payload.to_currency)}`,
    `<b>Status :</b> ${escape(payload.status)}`,
    `<b>Date :</b> ${escape(payload.created_at)}`,
  ].join("\n");
}

function formatDeposit(payload: DepositPayload): string {
  return [
    `<b>Deposit Received</b>`,
    ``,
    `Txn ID: <code>${escape(payload.id)}</code>`,
    `User: <b>${escape(payload.user)}</b>`,
    `Amount: <b>${escape(payload.amount)} ${escape(payload.currency)}</b>`,
    `Status: <b>${escape(payload.status)}</b>`,
    `Time: <b>${escape(payload.created_at)}</b>`,
  ].join("\n");
}

function formatPUFailure(payload: PUFailurePayload): string {
  return [
    `<b>Processing Unit Initiation Failed</b>`,
    ``,
    `Txn ID: <code>${escape(payload.id)}</code>`,
    `Currency: <b>${escape(payload.currency)}</b>`,
    `Message: <b>${escape(payload.message)}</b>`,
    `Time: <b>${escape(payload.created_at)}</b>`,
  ].join("\n");
}

interface BeneficiaryTransactionPayload {
  id: string;
  user: string;
  from_amount: string;
  from_currency: string;
  to_amount: string;
  to_currency: string;
  fx_rate: string;
  status: string;
  created_at: string;
  channel?: string | null;
}

interface DepositPayload {
  id: string;
  user: string;
  amount: string;
  currency: string;
  status: string;
  created_at: string;
  channel?: string | null;
}

interface PUFailurePayload {
  id: string;
  user: string;
  currency: string;
  status: number;
  message: string;
  created_at: string;
  channel?: string | null;
}

interface CallbackPayload {
  provider: string;
  payload: Record<string, unknown>;
  channel?: string | null;
}

async function getChatIdForUser(
  userId: bigint | null | undefined,
  defaultChatId: string,
): Promise<string> {
  if (!userId) return defaultChatId;
  try {
    const user = await prisma().user.findUnique({
      where: { id: userId },
      select: { merchantId: true },
    });
    if (user && user.merchantId) {
      const merchant = await prisma().merchant.findUnique({
        where: { id: user.merchantId },
        select: { telegram_channel: true },
      });
      if (merchant && merchant.telegram_channel) {
        return merchant.telegram_channel;
      }
    }
  } catch (err) {
    logger.warn({ err, userId: userId.toString() }, "Error resolving merchant chat ID");
  }
  return defaultChatId;
}

export const TelegramNotifier = {
  async notifyBeneficiaryTransaction(txnId: bigint): Promise<void> {
    const secret = await loadSecret();
    if (!secret || String(secret.ENABLED) === "false") return;
    
    const txn = await prisma().beneficiaryTransaction.findUnique({
      where: { id: txnId },
      include: { users: true, quotes: true },
    });
    
    if (!txn || !txn.users || !txn.quotes) return;
    
    let fromCurrency = "";
    if (txn.quotes.sourceType === "App\\Models\\VirtualAccount") {
      const va = await prisma().virtualAccount.findUnique({ where: { id: txn.quotes.sourceId! } });
      if (va) fromCurrency = va.currency;
    } else if (txn.quotes.sourceType === "App\\Models\\Wallet") {
      const wallet = await prisma().wallet.findUnique({ where: { id: txn.quotes.sourceId! } });
      if (wallet) fromCurrency = wallet.currency;
    }

    const { beneficiaryTransactionStatusLabel } = await import("../../helpers/constants");

    const payload: BeneficiaryTransactionPayload = {
      id: txn.uniqueId,
      user: txn.users.firstName ? `${txn.users.firstName} ${txn.users.lastName ?? ""}`.trim() : txn.users.email,
      from_amount: txn.totalAmount.toString(),
      from_currency: fromCurrency,
      to_amount: txn.recipientAmount?.toString() ?? "",
      to_currency: txn.receivingCurrency ?? "",
      fx_rate: txn.quotes.fxRate ?? "",
      status: beneficiaryTransactionStatusLabel(txn.status),
      created_at: txn.createdAt ? txn.createdAt.toISOString() : "",
    };

    const chatId = await getChatIdForUser(txn.users.id, secret.CHAT_ID);

    await sendRaw(
      formatBeneficiaryTransaction(payload),
      chatId,
      secret,
    );
  },

  async beneficiaryTransactionCreated(
    payload: BeneficiaryTransactionPayload,
  ): Promise<void> {
    const secret = await loadSecret();
    if (!secret || String(secret.ENABLED) === "false") return;
    const txn = await prisma().beneficiaryTransaction.findFirst({
      where: { uniqueId: payload.id },
      select: { userId: true },
    });
    const defaultChat = payload.channel ?? secret.CHAT_ID;
    const chatId = txn ? await getChatIdForUser(txn.userId, defaultChat) : defaultChat;
    await sendRaw(
      formatBeneficiaryTransaction(payload),
      chatId,
      secret,
    );
  },

  async depositReceived(payload: DepositPayload): Promise<void> {
    const secret = await loadSecret();
    if (!secret || String(secret.ENABLED) === "false") return;
    const txn = await prisma().depositTransaction.findFirst({
      where: { uniqueId: payload.id },
      select: { userId: true },
    });
    const defaultChat = payload.channel ?? secret.CHAT_ID;
    const chatId = txn ? await getChatIdForUser(txn.userId, defaultChat) : defaultChat;
    await sendRaw(formatDeposit(payload), chatId, secret);
  },

  async processingUnitInitiationFailed(payload: PUFailurePayload): Promise<void> {
    const secret = await loadSecret();
    if (!secret || String(secret.ENABLED) === "false") return;
    const txn = await prisma().beneficiaryTransaction.findFirst({
      where: { uniqueId: payload.id },
      select: { userId: true },
    });
    const defaultChat = payload.channel ?? secret.CHAT_ID;
    const chatId = txn ? await getChatIdForUser(txn.userId, defaultChat) : defaultChat;
    await sendRaw(
      formatPUFailure(payload),
      chatId,
      secret,
    );
  },

  async callbackReceived(payload: CallbackPayload): Promise<void> {
    const secret = await loadSecret();
    if (!secret || String(secret.ENABLED) === "false") return;
    const text = `<b>Callback received</b> [${escape(payload.provider)}]\n\n<pre>${escape(
      JSON.stringify(payload.payload).slice(0, 3500),
    )}</pre>`;
    await sendRaw(
      text,
      payload.channel ?? secret.CALLBACK_CHAT_ID ?? secret.CHAT_ID,
      secret,
    );
  },

  async userReportAlert(text: string, chatId?: string): Promise<void> {
    const secret = await loadSecret();
    if (!secret || String(secret.ENABLED) === "false") return;
    await sendRaw(text, chatId ?? secret.CHAT_ID, secret);
  },
};

void Prisma;
