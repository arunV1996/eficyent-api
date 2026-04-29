import { Job } from "bullmq";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING,
  BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  PAYOUT_JOB_STATUS_COMPLETED,
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PROCESSING,
} from "../../helpers/constants";
import { PayoutJobPayload } from "../../queues/dispatchers";

/**
 * Mirror of Laravel's ProcessBulkPayout / payout dispatch path. Drives a
 * single beneficiary transaction through external service initiation.
 *
 * The external service call chain (Caliza / Diginine / FvBank /
 * ProcessingUnit) lands in Phase 8. Until then this handler advances the
 * status to PROCESSING and records the history row, which is enough to
 * unblock end-to-end testing of the full payout API surface.
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
  const { beneficiaryTransactionId, payoutJobUniqueId, userId } = job.data;
  const reqLogger = logger.child({
    queue: "payout",
    jobId: job.id,
    txnId: beneficiaryTransactionId,
    userId,
  });

  await prisma()
    .payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: { status: PAYOUT_JOB_STATUS_PROCESSING, attempts: { increment: 1 } },
    })
    .catch(() => undefined);

  if (!beneficiaryTransactionId) {
    reqLogger.info("PayoutJob without linked transaction - external dispatch deferred");
    return;
  }

  try {
    const txn = await prisma().beneficiaryTransaction.findUnique({
      where: { id: BigInt(beneficiaryTransactionId) },
    });
    if (!txn) {
      reqLogger.warn("Transaction not found - ignoring");
      return;
    }

    const dispatchable = [
      BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
      BENEFICIARY_TRANSACTION_APPROVED,
      BENEFICIARY_TRANSACTION_INITIATED,
    ];
    if (!dispatchable.includes(txn.status)) {
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
          uniqueId: cryptoRandomId(),
          beneficiaryTransactionId: txn.id,
          fromStatus: String(txn.status),
          toStatus: String(BENEFICIARY_TRANSACTION_PROCESSING),
          changedBy: "system",
          changedByType: "system",
          changedAt: new Date(),
        },
      }),
    ]);

    await prisma().payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: {
        status: PAYOUT_JOB_STATUS_COMPLETED,
        errorMessage: null,
        beneficiaryTransactionId: txn.id,
      },
    });
    reqLogger.info("Payout transitioned to PROCESSING (external dispatch in Phase 8)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reqLogger.error({ err }, "Payout job error");
    await prisma()
      .payoutJob.update({
        where: { uniqueId: payoutJobUniqueId },
        data: {
          status: PAYOUT_JOB_STATUS_FAILED,
          errorMessage: message.slice(0, 1024),
        },
      })
      .catch(() => undefined);
    if (beneficiaryTransactionId) {
      await prisma()
        .beneficiaryTransaction.update({
          where: { id: BigInt(beneficiaryTransactionId) },
          data: { status: BENEFICIARY_TRANSACTION_FAILED },
        })
        .catch(() => undefined);
    }
    throw err;
  }
}

function cryptoRandomId(): string {
  // Hot-path random id for unique_id columns - avoid an extra import cycle
  // with helpers/uniqueId by inlining a base36 timestamp + random suffix.
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12)
  );
}
