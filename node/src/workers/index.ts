import { Job, Worker } from "bullmq";
import { env } from "../config/env";
import { getBullConnection } from "../config/redis";
import { logger } from "../helpers/logger";
import { QueueName, QueueNames } from "../queues/queues";
import { processPayout } from "./handlers/payoutHandler";
import { processBulkPayout } from "./handlers/bulkPayoutHandler";
import { processCallback } from "./handlers/callbackHandler";
import { processFxRates } from "./handlers/fxRatesHandler";
import { processIdempotencyReaper } from "./handlers/idempotencyReaperHandler";

/**
 * Worker registry. Each entry binds a queue to a handler with the
 * concurrency configured in env. New jobs are added by:
 *   1. Define payload type + dispatcher in `src/queues/dispatchers.ts`.
 *   2. Implement handler under `src/workers/handlers/<name>Handler.ts`.
 *   3. Register here.
 *
 * All handlers run inside the global Express request-id pattern: each Job
 * has a `data._reqId` carried from the API call (when applicable) so logs
 * stitch together across HTTP -> queue -> external service.
 */

interface WorkerDef {
  queue: QueueName;
  concurrency: number;
  handler: (job: Job) => Promise<unknown>;
}

const workers: Worker[] = [];

const definitions: WorkerDef[] = [
  {
    queue: QueueNames.Payout,
    concurrency: env().BULLMQ_PAYOUT_CONCURRENCY,
    handler: processPayout,
  },
  {
    queue: QueueNames.BulkPayout,
    concurrency: env().BULLMQ_BULK_PAYOUT_CONCURRENCY,
    handler: processBulkPayout,
  },
  {
    queue: QueueNames.Callback,
    concurrency: env().BULLMQ_CALLBACK_CONCURRENCY,
    handler: processCallback,
  },
  {
    queue: QueueNames.FxRates,
    concurrency: env().BULLMQ_FX_RATES_CONCURRENCY,
    handler: processFxRates,
  },
  {
    queue: QueueNames.IdempotencyReaper,
    concurrency: 1,
    handler: processIdempotencyReaper,
  },
  // Remaining queues (deposit, compliance, remittance, ...) are wired up
  // alongside their respective controller conversions in subsequent phases.
];

export async function startWorkers(): Promise<void> {
  const connection = await getBullConnection();
  for (const def of definitions) {
    const w = new Worker(def.queue, def.handler, {
      connection,
      prefix: env().BULLMQ_PREFIX,
      concurrency: def.concurrency,
      autorun: true,
      lockDuration: 60_000,
      stalledInterval: 30_000,
    });
    w.on("completed", (job) => {
      logger.info(
        { queue: def.queue, jobId: job.id, jobName: job.name },
        "Job completed",
      );
    });
    w.on("failed", (job, err) => {
      logger.error(
        { queue: def.queue, jobId: job?.id, jobName: job?.name, err },
        "Job failed",
      );
    });
    w.on("error", (err) => {
      logger.error({ queue: def.queue, err }, "Worker error");
    });
    workers.push(w);
    logger.info(
      { queue: def.queue, concurrency: def.concurrency },
      "Worker started",
    );
  }
}

export async function stopWorkers(): Promise<void> {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers.length = 0;
}
