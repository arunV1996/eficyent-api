import { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { logger } from "../../helpers/logger";
import { RemittanceBatchJobPayload } from "../../queues/dispatchers";
import { prisma } from "../../db/prisma";
import { Remittance } from "../../services/external/remittance";
import { settingGet } from "../../services/settings/settingsService";

/**
 * Mirror of Laravel ExecuteRemittanceBatchJob.
 *
 * Pulls the next batch of beneficiary_transactions with remittance_data
 * still null, runs Remittance.make() against each, and sleeps between
 * rows so we don't get rate-limited by Herald.
 */
export async function processRemittanceBatch(
  job: Job<RemittanceBatchJobPayload>,
): Promise<void> {
  logger.info({ jobId: job.id, triggeredBy: job.data.triggeredBy }, "Remittance batch job started");

  const limit = Number(await settingGet<string>("remittance_transactions_limit", "50")) || 50;
  const sleepMs = Number(await settingGet<string>("remittance_batch_sleep_ms", "200")) || 200;

  const transactions = await prisma().beneficiaryTransaction.findMany({
    where: { remittanceData: { equals: Prisma.DbNull } },
    orderBy: { id: "asc" },
    take: limit,
  });
  if (transactions.length === 0) {
    logger.info({ jobId: job.id }, "Remittance batch - no transactions found");
    return;
  }

  for (const txn of transactions) {
    try {
      logger.info({ txnId: txn.uniqueId }, "Processing remittance for transaction");
      if (txn.remittanceData) continue;
      const user = await prisma().user.findUnique({ where: { id: txn.userId } });
      if (!user) continue;
      await Remittance.make(txn, user);
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "remittance failed for transaction");
    }
    if (sleepMs > 0) await sleep(sleepMs);
  }

  logger.info({ jobId: job.id }, "Remittance batch job completed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
