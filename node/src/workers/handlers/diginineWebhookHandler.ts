import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { DiginineWebhookJobPayload } from "../../queues/dispatchers";
import { Secrets } from "../../config/secrets";
import { TelegramNotifier } from "../../services/external/telegram";

interface DiginineForwardSecret {
  CALLBACK_URL?: string;
}

const TIMEOUT_MS = 30_000;

/**
 * Mirror of Laravel ProcessDiginineWebhook job.
 *
 * Forwards the raw Diginine webhook payload to the operator-controlled
 * downstream callback URL. Throws on non-2xx so BullMQ retries.
 */
export async function processDiginineWebhook(
  job: Job<DiginineWebhookJobPayload>,
): Promise<void> {
  const { data } = job.data;
  logger.info({ jobId: job.id }, "Processing Diginine Webhook");

  void TelegramNotifier.callbackReceived({ provider: "Diginine", payload: data });

  let secret: DiginineForwardSecret;
  try {
    secret = await Secrets.external<DiginineForwardSecret & Record<string, unknown>>(
      "diginine",
    );
  } catch (err) {
    logger.error({ err }, "Diginine secret bundle missing");
    throw err;
  }
  if (!secret.CALLBACK_URL) {
    logger.warn({ jobId: job.id }, "Diginine CALLBACK_URL not configured - skipping forward");
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
      "Diginine callback forwarded",
    );
    if (!res.ok) {
      throw new Error(`Diginine callback forwarding failed - status ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
