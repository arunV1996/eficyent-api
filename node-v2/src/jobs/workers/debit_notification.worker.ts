import { Job, Worker } from "bullmq";
import { QueueNames } from "../config";
import { createQueueWorker } from "./worker_factory";

/**
 * Consumer for the "DebitNotification" queue.
 *
 * V2 STUB: logs and acknowledges the job. Do NOT run the v2 worker
 * fleet against the shared production Redis until the real processor
 * is ported here — the legacy /node worker fleet is still the
 * authoritative consumer, and a stub would swallow its jobs.
 */

const processor = async (job: Job): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(
        `[worker:${QueueNames.DebitNotification}] [stub] job ${job.id} (${job.name})`,
        JSON.stringify(job.data),
    );
};

export const debitNotificationWorker: Worker = createQueueWorker(
    QueueNames.DebitNotification,
    "WORKER_DEBIT_NOTIFICATION_CONCURRENCY",
    processor,
);
