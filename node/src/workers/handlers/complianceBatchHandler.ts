import { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { logger } from "../../helpers/logger";
import { ComplianceBatchJobPayload } from "../../queues/dispatchers";
import { prisma } from "../../db/prisma";
import { Compliance } from "../../services/external/compliance";
import { settingGet } from "../../services/settings/settingsService";

/**
 * Mirror of Laravel ExecuteComplianceBatchJob.
 *
 * Pulls the next batch of beneficiary_transactions where compliance_data
 * is null, runs Compliance.make() against each (without flipping status -
 * mirrors `app(ComplianceService::class)->make($txn, $txn->user, false)`),
 * and sleeps between rows so we don't get rate-limited by the provider.
 *
 * On success, the Laravel job also calls ProcessingUnit::sync(); the
 * sync flow is currently scoped out for this phase since it depends on
 * the BeneficiaryTransactionService::sync() which is a separate flow
 * we haven't ported. Logged as a deferred item.
 */
export async function processComplianceBatch(
  job: Job<ComplianceBatchJobPayload>,
): Promise<void> {
  logger.info({ jobId: job.id, triggeredBy: job.data.triggeredBy }, "Compliance batch job started");

  const limit = Number(await settingGet<string>("compliance_transactions_limit", "100")) || 100;
  const sleepMs = Number(await settingGet<string>("compliance_batch_sleep_ms", "200")) || 200;

  const transactions = await prisma().beneficiaryTransaction.findMany({
    where: { complianceData: { equals: Prisma.DbNull } },
    orderBy: { id: "asc" },
    take: limit,
  });
  if (transactions.length === 0) {
    logger.info({ jobId: job.id }, "Compliance batch - no transactions found");
    return;
  }

  for (const txn of transactions) {
    try {
      logger.info(
        { txnId: txn.uniqueId },
        "Processing compliance for transaction",
      );
      if (txn.complianceData) {
        // Concurrent-batch race guard.
        continue;
      }
      const user = await prisma().user.findUnique({ where: { id: txn.userId } });
      if (!user) continue;
      // updateStatus = false to mirror Laravel batch flow.
      await Compliance.make(txn, user, false);
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "Compliance failed for transaction");
    }
    if (sleepMs > 0) await sleep(sleepMs);
  }

  logger.info({ jobId: job.id }, "Compliance batch job completed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
