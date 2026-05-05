import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { CalizaWebhookJobPayload } from "../../queues/dispatchers";
import { Secrets } from "../../config/secrets";
import { TelegramNotifier } from "../../services/external/telegram";

interface CalizaForwardSecret {
  CALLBACK_URL?: string;
}

const TIMEOUT_MS = 30_000;

/**
 * Mirror of Laravel ProcessCalizaWebhook job.
 *
 * Forwards the raw Caliza webhook payload to the operator-controlled
 * downstream callback URL. The original Laravel job throws when delivery
 * fails so BullMQ retries with the configured exponential backoff.
 *
 * Telegram notification fires once per attempt for ops visibility.
 *
 * The downstream URL is read from Secrets ("caliza" provider, key
 * `CALLBACK_URL`); the actual business processing (status updates, ledger
 * writes) happens in that downstream service in production.
 */
export async function processCalizaWebhook(
  job: Job<CalizaWebhookJobPayload>,
): Promise<void> {
  const { data } = job.data;
  logger.info({ jobId: job.id }, "Processing Caliza Webhook");

  void TelegramNotifier.callbackReceived({ provider: "Caliza", payload: data });

  let secret: CalizaForwardSecret;
  try {
    secret = await Secrets.external<CalizaForwardSecret & Record<string, unknown>>(
      "caliza",
    );
  } catch (err) {
    logger.error({ err }, "Caliza secret bundle missing");
    throw err;
  }
  if (!secret.CALLBACK_URL) {
    logger.warn({ jobId: job.id }, "Caliza CALLBACK_URL not configured - skipping forward");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(secret.CALLBACK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    logger.info(
      { jobId: job.id, url: secret.CALLBACK_URL, status: res.status, response: parsed },
      "Caliza callback forwarded",
    );
    if (!res.ok) {
      throw new Error(`Caliza callback forwarding failed - status ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
