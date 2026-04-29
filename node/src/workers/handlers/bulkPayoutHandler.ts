import { Job } from "bullmq";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PROCESSING,
} from "../../helpers/constants";
import { BulkPayoutJobPayload } from "../../queues/dispatchers";

/**
 * Mirror of Laravel's ProcessBulkPayout job. Drives one PayoutJob row to
 * its terminal state by:
 *   1. Materialising the Quote (cross-currency calls into the Massive driver)
 *   2. Upserting the BeneficiaryAccount + Sender from the row payload
 *   3. Calling beneficiaryTransactionService.createPayoutTransaction
 *
 * The full materialisation path depends on the Phase-8 external drivers
 * (Massive quotes, Caliza/Diginine/FvBank create), so this handler is
 * intentionally a no-op past the "PROCESSING" transition. PayoutJob is
 * left in PROCESSING until Phase 8 wires the rest; the API layer's
 * `retry-job` endpoint can rotate any FAILED job back to PENDING.
 */
export async function processBulkPayout(
  job: Job<BulkPayoutJobPayload>,
): Promise<void> {
  const { payoutJobUniqueId, userId } = job.data;
  const reqLogger = logger.child({
    queue: "bulk-payout",
    jobId: job.id,
    payoutJobUniqueId,
    userId,
  });

  await prisma()
    .payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: {
        status: PAYOUT_JOB_STATUS_PROCESSING,
        attempts: { increment: 1 },
      },
    })
    .catch((err: unknown) => {
      reqLogger.warn({ err }, "PayoutJob status bump failed");
    });

  reqLogger.info(
    "Bulk payout PROCESSING - row materialisation deferred to Phase 8",
  );

  // Phase 8 will replace the no-op below with:
  //   const job = await prisma().payoutJob.findUniqueOrThrow({ where: { uniqueId: payoutJobUniqueId } });
  //   const payload = job.payload as BulkPayoutPayload;
  //   const quote = await materialiseQuote(payload, user);
  //   const beneficiary = await upsertBeneficiary(payload.beneficiary, user);
  //   const sender = await upsertSender(payload.remitter, user);
  //   const txn = await createPayoutTransaction({...}, user);
  //   await job.update({ beneficiaryTransactionId: txn.id, status: COMPLETED });
}

/**
 * Lightweight handler for individual job failures - flips status FAILED
 * + records the error message. Wired up via Worker.on("failed", ...).
 */
export async function recordBulkPayoutFailure(
  payoutJobUniqueId: string,
  errorMessage: string,
): Promise<void> {
  await prisma()
    .payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: {
        status: PAYOUT_JOB_STATUS_FAILED,
        errorMessage: errorMessage.slice(0, 1024),
      },
    })
    .catch(() => undefined);
}
