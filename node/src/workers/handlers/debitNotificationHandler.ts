import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { DebitNotificationJobPayload } from "../../queues/dispatchers";
import { prisma } from "../../db/prisma";
import { BENEFICIARY_TRANSACTION_COMPLETED } from "../../helpers/constants";

/**
 * Mirror of Laravel SendDebitNotificationJob + SendDebitNotification action.
 *
 * On payout completion, fires a notification to the internal Reports
 * microservice (`api/debit_transactions`) so finance can reconcile MID
 * and merchant wallet movements. The actual HTTP call to the Reports
 * service lands in Phase 10 alongside the rest of the Reports surface;
 * for now this handler enforces the "transaction must be completed"
 * gate and logs the intent so we can replay it once the Reports service
 * is wired.
 */
export async function processDebitNotification(
  job: Job<DebitNotificationJobPayload>,
): Promise<void> {
  const txn = await prisma().beneficiaryTransaction.findUnique({
    where: { id: BigInt(job.data.beneficiaryTransactionId) },
  });
  if (!txn) {
    logger.warn(
      { jobId: job.id, beneficiaryTransactionId: job.data.beneficiaryTransactionId },
      "SendDebitNotification - transaction not found",
    );
    return;
  }
  if (txn.status !== BENEFICIARY_TRANSACTION_COMPLETED) {
    logger.info(
      { jobId: job.id, txn: txn.uniqueId, status: txn.status },
      "SendDebitNotification - transaction not eligible (not COMPLETED)",
    );
    return;
  }
  logger.info(
    { jobId: job.id, txn: txn.uniqueId },
    "SendDebitNotification dispatched (Reports microservice integration deferred to Phase 10)",
  );
}
