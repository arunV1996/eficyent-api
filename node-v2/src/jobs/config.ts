import { JobsOptions, Queue } from "bullmq";

/**
 * Shared queue configuration — the Laravel queue.php equivalent.
 *
 * One core queue carries every job (like Laravel's "default" queue);
 * jobs are distinguished by job name, and the centralized worker
 * (src/worker.ts) routes each name to its execute function.
 *
 * Configuration: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (optional),
 * QUEUE_NAME (default "default"), BULLMQ_PREFIX (default "eficyent"),
 * BULLMQ_DEFAULT_ATTEMPTS (default 3), BULLMQ_DEFAULT_BACKOFF_MS
 * (default 5000).
 */

export const connectionOptions = () => ({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD
        ? { password: process.env.REDIS_PASSWORD }
        : {}),
    maxRetriesPerRequest: null as null,
});

export const bullmqPrefix = (): string =>
    process.env.BULLMQ_PREFIX || "eficyent";

export const queueName = (): string => process.env.QUEUE_NAME || "default";

let coreQueue: Queue | null = null;

export const getQueue = (): Queue => {
    if (coreQueue) {
        return coreQueue;
    }
    coreQueue = new Queue(queueName(), {
        connection: connectionOptions(),
        prefix: bullmqPrefix(),
        defaultJobOptions: {
            attempts: parseInt(process.env.BULLMQ_DEFAULT_ATTEMPTS || "3", 10),
            backoff: {
                type: "exponential",
                delay: parseInt(
                    process.env.BULLMQ_DEFAULT_BACKOFF_MS || "5000",
                    10,
                ),
            },
            removeOnComplete: { count: 5_000, age: 60 * 60 * 24 * 7 },
            removeOnFail: { count: 10_000, age: 60 * 60 * 24 * 30 },
        } satisfies JobsOptions,
    });
    return coreQueue;
};

/** Shared producer helper used by every job's dispatch function. */
export const enqueue = async (
    jobName: string,
    data: unknown,
    options?: JobsOptions,
): Promise<string> => {
    const job = await getQueue().add(jobName, data, options);
    return job.id ?? "";
};

export const closeQueue = async (): Promise<void> => {
    if (coreQueue) {
        await coreQueue.close();
        coreQueue = null;
    }
};

/** Backwards-compatible alias (pre-refactor callers used closeQueues). */
export const closeQueues = closeQueue;
