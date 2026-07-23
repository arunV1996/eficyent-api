import { JobsOptions, Queue } from "bullmq";

/**
 * Shared BullMQ configuration: Redis connection options, queue name
 * registry, and lazily-created Queue instances used by the dispatchers.
 *
 * CRITICAL COMPATIBILITY NOTE: queue names, the BULLMQ_PREFIX, job
 * names, and payload shapes are kept byte-identical to the legacy
 * /node service. During the migration both services share the same
 * Redis, so jobs enqueued by node-v2 can be processed by the legacy
 * worker fleet and vice versa.
 *
 * Configuration: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (optional),
 * BULLMQ_PREFIX (default "eficyent"), BULLMQ_DEFAULT_ATTEMPTS
 * (default 3), BULLMQ_DEFAULT_BACKOFF_MS (default 5000).
 */

export const QueueNames = {
    Payout: "payout",
    Deposit: "deposit",
    Compliance: "compliance",
    Remittance: "remittance",
    BeneficiaryValidation: "beneficiary-validation",
    FxRates: "fx-rates",
    Callback: "callback",
    BulkPayout: "bulk-payout",
    DebitNotification: "debit-notification",
    CalizaWebhook: "caliza-webhook",
    DiginineWebhook: "diginine-webhook",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

const queues = new Map<QueueName, Queue>();

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

export const getQueue = (name: QueueName): Queue => {
    let queue = queues.get(name);
    if (queue) {
        return queue;
    }
    queue = new Queue(name, {
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
    queues.set(name, queue);
    return queue;
};

/** Shared producer helper used by every dispatcher. */
export const enqueueJob = async (
    queueName: QueueName,
    jobName: string,
    data: unknown,
    options?: JobsOptions,
): Promise<string> => {
    const queue = getQueue(queueName);
    const job = await queue.add(jobName, data, options);
    return job.id ?? "";
};

export const closeQueues = async (): Promise<void> => {
    await Promise.allSettled(
        [...queues.values()].map((queue) => queue.close()),
    );
    queues.clear();
};
