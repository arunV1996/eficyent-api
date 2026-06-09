import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Services\\Callbacks\\MerchantCallbackDispatcher.
 *
 * Resolves the merchant.callback_url for the given user and POSTs the
 * Laravel-shaped envelope:
 *
 *   {
 *     "event": <eventType>,
 *     "data":  <payload>,
 *     "timestamp": <unix-seconds>
 *   }
 *
 * Returns a structured `logs` object so the SendCallback worker can
 * persist it onto callback_logs (polymorphic on the BeneficiaryTransaction
 * row when a unique_id is included in the payload).
 *
 * NOTE: deliberately matches Laravel exactly (no signing). When merchants
 * are ready to verify signatures, add an `X-Signature` HMAC header keyed
 * on `merchants.salt_key` here.
 */
export interface MerchantCallbackResult {
  merchantId: string;
  url?: string;
  status?: number;
  response?: unknown;
  payload?: Record<string, unknown>;
  requestedAt?: string;
  completedAt?: string;
  sendCallback: "SUCCESS" | "FAILED";
  reason?: string;
}

const TIMEOUT_MS = 30_000;

export async function sendMerchantCallback(
  userId: bigint,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<MerchantCallbackResult> {
  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: { id: true, merchantId: true },
  });
  const merchant = user?.merchantId
    ? await prisma().merchant.findUnique({
        where: { id: user.merchantId },
        select: { id: true, uniqueId: true, callbackUrl: true },
      })
    : null;

  const merchantTag = merchant?.uniqueId ?? "--";

  if (!merchant || !merchant.callbackUrl) {
    const reason = `Callback not configured for user ${merchantTag}`;
    logger.info({ merchantId: merchantTag, sendCallback: "FAILED", reason });
    return { merchantId: merchantTag, sendCallback: "FAILED", reason };
  }

  const body = {
    event: eventType,
    data: payload,
    timestamp: Math.floor(Date.now() / 1000),
  };

  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(merchant.callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const completedAt = new Date().toISOString();
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const result: MerchantCallbackResult = {
      merchantId: merchantTag,
      url: merchant.callbackUrl,
      status: res.status,
      response: parsed,
      payload: body,
      requestedAt,
      completedAt,
      sendCallback: res.ok ? "SUCCESS" : "FAILED",
    };
    logger.info({ ...result }, `CallbackLog for user ${merchantTag}`);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: MerchantCallbackResult = {
      merchantId: merchantTag,
      url: merchant.callbackUrl,
      payload: body,
      requestedAt,
      sendCallback: "FAILED",
      reason: message,
    };
    logger.warn({ ...result, err }, `CallbackLog for user ${merchantTag}`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
