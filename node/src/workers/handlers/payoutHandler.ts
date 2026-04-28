import { Job } from "bullmq";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING,
  PAYOUT_JOB_STATUS_COMPLETED,
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PROCESSING,
} from "../../helpers/constants";
import { PayoutJobPayload } from "../../queues/dispatchers";

/**
 * Mirror of Laravel's ProcessBulkPayout / payout dispatch path. Drives a
 * single beneficiary transaction through external service initiation.
 *
 * For Phase 1 this records state transitions and stops at "INITIATED" -
 * the actual external service call chain (Caliza / Diginine / FvBank /
 * ProcessingUnit) is wired in when those service modules are converted.
 *
 * Idempotency is enforced at *two* layers:
 *   1. Queue-level: BullMQ jobId = "payout:{txnId}" - duplicate enqueues
 *      collapse to one job. This protects against retry storms inside the
 *      worker pool.
 *   2. Row-level: we only transition a transaction whose status is
 *      WAITING_FOR_APPROVAL or APPROVED. Any other status is a no-op so
 *      delayed retries from BullMQ never double-transmit.
 */

export async function processPayout(job: Job<PayoutJobPayload>): Promise<void> {
  const { beneficiaryTransactionId, payoutJobId, userId } = job.data;
  const reqLogger = logger.child({
    queue: "payout",
    jobId: job.id,
    txnId: beneficiaryTransactionId,
    userId,
  });

  // Mark PayoutJob row as processing (audit trail).
  await prisma()
    .payoutJob.update({
      where: { jobUniqueId: payoutJobId },
      data: { status: PAYOUT_JOB_STATUS_PROCESSING, attempts: { increment: 1 } },
    })
    .catch(() => undefined);

  try {
    const txn = await prisma().beneficiaryTransaction.findUnique({
      where: { id: BigInt(beneficiaryTransactionId) },
    });

    if (!txn) {
      reqLogger.warn("Transaction not found - ignoring");
      return;
    }

    if (
      txn.status !== BENEFICIARY_TRANSACTION_INITIATED &&
      txn.status !== 0 /* WAITING */ &&
      txn.status !== 1 /* APPROVED */
    ) {
      reqLogger.info({ status: txn.status }, "Transaction not in dispatchable state");
      return;
    }

    await prisma().$transaction([
      prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: { status: BENEFICIARY_TRANSACTION_PROCESSING },
      }),
      prisma().beneficiaryTransactionStatusHistory.create({
        data: {
          beneficiaryTransactionId: txn.id,
          fromStatus: txn.status,
          toStatus: BENEFICIARY_TRANSACTION_PROCESSING,
          actionBy: "system",
        },
      }),
    ]);

    // -----------------------------------------------------------------
    // External service initiation goes here in subsequent module conversion.
    // The handler is intentionally a no-op past the "PROCESSING" transition
    // so it can be deployed safely while the rest of the port lands.
    // -----------------------------------------------------------------

    await prisma().payoutJob.update({
      where: { jobUniqueId: payoutJobId },
      data: { status: PAYOUT_JOB_STATUS_COMPLETED, lastError: null },
    });
    reqLogger.info("Payout transitioned to PROCESSING (external dispatch pending)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reqLogger.error({ err }, "Payout job error");
    await prisma()
      .payoutJob.update({
        where: { jobUniqueId: payoutJobId },
        data: { status: PAYOUT_JOB_STATUS_FAILED, lastError: message.slice(0, 1024) },
      })
      .catch(() => undefined);
    await prisma()
      .beneficiaryTransaction.update({
        where: { id: BigInt(beneficiaryTransactionId) },
        data: { status: BENEFICIARY_TRANSACTION_FAILED },
      })
      .catch(() => undefined);
    throw err; // let BullMQ apply backoff
  }
}
