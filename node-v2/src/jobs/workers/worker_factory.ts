import { Job, Worker } from "bullmq";
import { bullmqPrefix, connectionOptions, QueueName } from "../config";

/**
 * Shared consumer factory. Each queue's worker file builds its Worker
 * through this so the connection, prefix, lock settings, and event
 * logging stay uniform (settings mirror the legacy worker fleet).
 *
 * Concurrency comes from the per-queue .env key (WORKER_*_CONCURRENCY)
 * and falls back to 1 when the key is missing or not a number.
 */

export const concurrencyFromEnv = (
    envKey: string,
    fallback = 1,
): number => {
    const parsed = parseInt(process.env[envKey] ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const createQueueWorker = (
    queueName: QueueName,
    concurrencyEnvKey: string,
    processor: (job: Job) => Promise<unknown>,
): Worker => {
    const concurrency = concurrencyFromEnv(concurrencyEnvKey);
    const worker = new Worker(queueName, processor, {
        connection: connectionOptions(),
        prefix: bullmqPrefix(),
        concurrency,
        autorun: true,
        lockDuration: 60_000,
        stalledInterval: 30_000,
    });

    worker.on("completed", (job) => {
        // eslint-disable-next-line no-console
        console.log(
            `[worker:${queueName}] completed job ${job.id} (${job.name})`,
        );
    });
    worker.on("failed", (job, error) => {
        // eslint-disable-next-line no-console
        console.error(
            `[worker:${queueName}] failed job ${job?.id} (${job?.name}):`,
            error?.message ?? error,
        );
    });
    worker.on("error", (error) => {
        // eslint-disable-next-line no-console
        console.error(`[worker:${queueName}] worker error:`, error);
    });

    // eslint-disable-next-line no-console
    console.log(
        `[worker:${queueName}] started (concurrency ${concurrency})`,
    );
    return worker;
};
