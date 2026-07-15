import { JobsOptions, Queue } from "bullmq";

/**
 * Queue registry + typed dispatchers (mirror of the legacy
 * queues/queues.ts + queues/dispatchers.ts).
 *
 * CRITICAL COMPATIBILITY NOTE: queue names, the BULLMQ_PREFIX, job
 * names, and payload shapes are kept byte-identical to the legacy
 * /node service. During the migration both services share the same
 * Redis, so jobs enqueued by node-v2 are processed by the legacy
 * worker fleet — there is no functional gap while the v2 worker
 * layer is still being ported.
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

const connectionOptions = () => ({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD
        ? { password: process.env.REDIS_PASSWORD }
        : {}),
    maxRetriesPerRequest: null as null,
});

const getQueue = (name: QueueName): Queue => {
    let queue = queues.get(name);
    if (queue) {
        return queue;
    }
    queue = new Queue(name, {
        connection: connectionOptions(),
        prefix: process.env.BULLMQ_PREFIX || "eficyent",
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

export const closeQueues = async (): Promise<void> => {
    await Promise.allSettled(
        [...queues.values()].map((queue) => queue.close()),
    );
    queues.clear();
};

// ---------------------------------------------------------------------------
// Typed dispatchers — the only place callers enqueue work from, so the
// payload shapes stay enforced (mirror of the legacy Dispatch object).
// ---------------------------------------------------------------------------

export interface PayoutJobPayload {
    beneficiaryTransactionId?: string;
    payoutJobUniqueId: string;
    userId: string;
    source: "direct" | "instant" | "approval" | "bulk";
}

export interface BulkPayoutJobPayload {
    payoutJobUniqueId: string;
    userId: string;
}

export interface DebitNotificationJobPayload {
    beneficiaryTransactionId: string;
}

export interface CalizaWebhookJobPayload {
    data: Record<string, unknown>;
}

export interface DiginineWebhookJobPayload {
    data: Record<string, unknown>;
}

export interface CallbackJobPayload {
    userId: string;
    eventType: string;
    payload: Record<string, unknown>;
    beneficiaryTransactionUniqueId?: string;
    depositTransactionUniqueId?: string;
}

const enqueue = async (
    queueName: QueueName,
    jobName: string,
    data: unknown,
    options?: JobsOptions,
): Promise<string> => {
    const queue = getQueue(queueName);
    const job = await queue.add(jobName, data, options);
    return job.id ?? "";
};

// Job names and jobId dedup patterns mirror the legacy
// queues/dispatchers.ts exactly — the legacy workers consume these
// queues from the shared Redis, so both must stay byte-identical.
export const Dispatch = {
    payout(
        payload: PayoutJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return enqueue(QueueNames.Payout, "ProcessPayout", payload, {
            jobId: payload.beneficiaryTransactionId
                ? `payout-${payload.beneficiaryTransactionId}`
                : `payout-job-${payload.payoutJobUniqueId}`,
            ...options,
        });
    },
    bulkPayout(
        payload: BulkPayoutJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return enqueue(QueueNames.BulkPayout, "ProcessBulkPayout", payload, {
            jobId: `bulk-${payload.payoutJobUniqueId}`,
            ...options,
        });
    },
    callback(
        payload: CallbackJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return enqueue(QueueNames.Callback, "SendCallback", payload, options);
    },
    calizaWebhook(
        payload: CalizaWebhookJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return enqueue(
            QueueNames.CalizaWebhook,
            "ProcessCalizaWebhook",
            payload,
            options,
        );
    },
    diginineWebhook(
        payload: DiginineWebhookJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return enqueue(
            QueueNames.DiginineWebhook,
            "ProcessDiginineWebhook",
            payload,
            options,
        );
    },
    debitNotification(
        payload: DebitNotificationJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return enqueue(
            QueueNames.DebitNotification,
            "SendDebitNotification",
            payload,
            {
                jobId: `debit-${payload.beneficiaryTransactionId}`,
                ...options,
            },
        );
    },
};
