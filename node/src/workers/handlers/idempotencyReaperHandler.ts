import { Job } from "bullmq";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";

/**
 * Removes expired idempotency_keys rows from the durable store. Redis
 * entries expire automatically; the DB copy needs cleanup so the table
 * doesn't grow unbounded.
 */
export async function processIdempotencyReaper(job: Job): Promise<void> {
  const now = new Date();
  const result = await prisma().idempotencyKey.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  logger.info(
    { jobId: job.id, deleted: result.count },
    "Idempotency reaper run complete",
  );
}
