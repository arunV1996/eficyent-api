import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";
import { Prisma } from "@prisma/client";

/**
 * Mirror of App\\Helpers\\TelegramHelper + App\\Services\\Telegram\\TelegramNotifier.
 *
 * Telegram is best-effort - we never let a notification failure break the
 * primary operation. Every send returns void.
 *
 * Bot token + default chat id come from the `eficyent/<env>/external/telegram`
 * secret bundle:
 *   {
 *     "BOT_TOKEN": "...",
 *     "CHAT_ID": "...",
 *     "CALLBACK_CHAT_ID": "...",
 *     "ENABLED": true
 *   }
 */

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
    `<b>Beneficiary Transaction Created</b>`,
    ``,
    `Txn ID: <code>${escape(payload.id)}</code>`,
    `User: <b>${escape(payload.user)}</b>`,
    `Amount: <b>${escape(payload.from_amount)} ${escape(payload.from_currency)}</b>`,
    `Receiving: <b>${escape(payload.to_amount)} ${escape(payload.to_currency)}</b>`,
    `FX Rate: <b>${escape(payload.fx_rate)}</b>`,
    `Status: <b>${escape(payload.status)}</b>`,
    `Time: <b>${escape(payload.created_at)}</b>`,
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

export const TelegramNotifier = {
  async beneficiaryTransactionCreated(
    payload: BeneficiaryTransactionPayload,
  ): Promise<void> {
    const secret = await loadSecret();
    if (!secret || secret.ENABLED === false) return;
    await sendRaw(
      formatBeneficiaryTransaction(payload),
      payload.channel ?? secret.CHAT_ID,
      secret,
    );
  },

  async depositReceived(payload: DepositPayload): Promise<void> {
    const secret = await loadSecret();
    if (!secret || secret.ENABLED === false) return;
    await sendRaw(formatDeposit(payload), payload.channel ?? secret.CHAT_ID, secret);
  },

  async processingUnitInitiationFailed(payload: PUFailurePayload): Promise<void> {
    const secret = await loadSecret();
    if (!secret || secret.ENABLED === false) return;
    await sendRaw(
      formatPUFailure(payload),
      payload.channel ?? secret.CHAT_ID,
      secret,
    );
  },

  async callbackReceived(payload: CallbackPayload): Promise<void> {
    const secret = await loadSecret();
    if (!secret || secret.ENABLED === false) return;
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
    if (!secret || secret.ENABLED === false) return;
    await sendRaw(text, chatId ?? secret.CHAT_ID, secret);
  },
};

void Prisma;
