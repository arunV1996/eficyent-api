import { Job, Worker } from "bullmq";
import dotenv from "dotenv";
import {
    bullmqPrefix,
    closeQueue,
    connectionOptions,
    queueName,
} from "./jobs/config";
import {
    executeCompliance,
    COMPLIANCE_JOB,
} from "./jobs/ComplianceJob";
import {
    executeProcessCalizaWebhook,
    PROCESS_CALIZA_WEBHOOK_JOB,
} from "./jobs/ProcessCalizaWebhookJob";
import {
    executeProcessDiginineWebhook,
    PROCESS_DIGININE_WEBHOOK_JOB,
} from "./jobs/ProcessDiginineWebhookJob";
import {
    executeProcessingUnit,
    PROCESSING_UNIT_JOB,
} from "./jobs/ProcessingUnitJob";
import {
    executeRefreshFxRates,
    REFRESH_FX_RATES_JOB,
} from "./jobs/RefreshFxRatesJob";
import {
    executeSendCallback,
    SEND_CALLBACK_JOB,
} from "./jobs/SendCallbackJob";
import {
    executeSendDebitNotification,
    SEND_DEBIT_NOTIFICATION_JOB,
} from "./jobs/SendDebitNotificationJob";
import { loadSecretsIntoEnv } from "./services/secrets_manager.service";

/**
 * Centralized worker — the `php artisan queue:work` equivalent, run
 * with `npm run worker` (ts-node) or `node dist/worker.js` in
 * production. Entirely independent of the API server (src/index.ts).
 *
 * One BullMQ Worker consumes the core queue; the processor routes each
 * job.name to the matching execute function from src/jobs/. Register
 * new jobs by adding their (JOB_NAME -> execute) pair to jobRegistry.
 */

dotenv.config();

const jobRegistry: Record<string, (job: Job) => Promise<unknown>> = {
    [PROCESSING_UNIT_JOB]: executeProcessingUnit,
    [COMPLIANCE_JOB]: executeCompliance,
    [SEND_CALLBACK_JOB]: executeSendCallback,
    [REFRESH_FX_RATES_JOB]: executeRefreshFxRates,
    [PROCESS_CALIZA_WEBHOOK_JOB]: executeProcessCalizaWebhook,
    [PROCESS_DIGININE_WEBHOOK_JOB]: executeProcessDiginineWebhook,
    [SEND_DEBIT_NOTIFICATION_JOB]: executeSendDebitNotification,
};

const routeJob = async (job: Job): Promise<unknown> => {
    const execute = jobRegistry[job.name];
    if (!execute) {
        throw new Error(`No job registered for name "${job.name}".`);
    }
    return execute(job);
};

const startWorker = async (): Promise<void> => {
    await loadSecretsIntoEnv();

    const concurrency = (() => {
        const parsed = parseInt(process.env.QUEUE_CONCURRENCY ?? "", 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
    })();

    const worker = new Worker(queueName(), routeJob, {
        connection: connectionOptions(),
        prefix: bullmqPrefix(),
        concurrency,
        autorun: true,
        lockDuration: 60_000,
        stalledInterval: 30_000,
    });

    worker.on("active", (job) => {
        // eslint-disable-next-line no-console
        console.log(
            `[worker] picked up job ${job.id} (${job.name}) attempt ${
                job.attemptsMade + 1
            }`,
        );
    });
    worker.on("completed", (job) => {
        // eslint-disable-next-line no-console
        console.log(`[worker] completed job ${job.id} (${job.name})`);
    });
    worker.on("failed", (job, error) => {
        // eslint-disable-next-line no-console
        console.error(
            `[worker] failed job ${job?.id} (${job?.name}):`,
            error?.message ?? error,
        );
    });
    worker.on("error", (error) => {
        // eslint-disable-next-line no-console
        console.error("[worker] worker error:", error);
    });

    await worker.waitUntilReady();
    // eslint-disable-next-line no-console
    console.log(
        `Queue worker running: queue "${queueName()}" (prefix "${bullmqPrefix()}", concurrency ${concurrency}, ${
            Object.keys(jobRegistry).length
        } jobs registered) connected to Redis (${
            process.env.REDIS_HOST || "127.0.0.1"
        }:${process.env.REDIS_PORT || "6379"}).`,
    );

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        // eslint-disable-next-line no-console
        console.log(`${signal} received — closing queue worker...`);
        await worker.close();
        await closeQueue();
        // eslint-disable-next-line no-console
        console.log("Queue worker shut down cleanly.");
        process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("unhandledRejection", (reason) => {
        // eslint-disable-next-line no-console
        console.error("Unhandled promise rejection in worker:", reason);
    });
    process.on("uncaughtException", (error) => {
        // eslint-disable-next-line no-console
        console.error("Uncaught exception in worker:", error);
        void shutdown("uncaughtException");
    });
};

startWorker().catch((startupError) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start queue worker:", startupError);
    process.exit(1);
});
