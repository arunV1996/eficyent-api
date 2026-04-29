import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { CallbackJobPayload } from "../../queues/dispatchers";

/**
 * Mirror of Laravel SendCallbackJob. Delivers a webhook to the merchant /
 * white-label client URL with retry + exponential backoff (handled by BullMQ).
 *
 * Real implementation (HMAC signing, delivery audit row, response store)
 * lands when the Callbacks/* services are converted.
 */
export async function processCallback(job: Job<CallbackJobPayload>): Promise<void> {
  logger.info(
    { jobId: job.id, url: job.data.url, externalRef: job.data.externalReferenceId },
    "Callback handler placeholder - implement when Callbacks service is ported",
  );
}
