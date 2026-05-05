import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { DebitNotificationJobPayload } from "../../queues/dispatchers";
import { sendDebitNotification } from "../../services/reports/debitNotification";

/**
 * Mirror of Laravel SendDebitNotificationJob + SendDebitNotification action.
 *
 * Posts a debit notification to the Reports microservice when a payout
 * completes. Eligibility (status == COMPLETED) is enforced inside
 * sendDebitNotification(). The job swallows non-2xx outcomes so
 * BullMQ doesn't retry indefinitely on Reports-server outages
 * (Laravel's behavior is also fire-and-forget here).
 */
export async function processDebitNotification(
  job: Job<DebitNotificationJobPayload>,
): Promise<void> {
  const { beneficiaryTransactionId } = job.data;
  logger.info(
    { jobId: job.id, beneficiaryTransactionId },
    "SendDebitNotificationJob started",
  );
  await sendDebitNotification(BigInt(beneficiaryTransactionId));
  logger.info(
    { jobId: job.id, beneficiaryTransactionId },
    "SendDebitNotificationJob ended",
  );
}
