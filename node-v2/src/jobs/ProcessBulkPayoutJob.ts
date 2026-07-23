import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const PROCESS_BULK_PAYOUT_JOB = "ProcessBulkPayout";

export interface ProcessBulkPayoutPayload {
    payoutJobUniqueId: string;
    userId: string;
}

export const dispatchProcessBulkPayout = async (
    payload: ProcessBulkPayoutPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(PROCESS_BULK_PAYOUT_JOB, payload, {
        jobId: `bulk-${payload.payoutJobUniqueId}`,
        ...options,
    });

export const executeProcessBulkPayout = async (job: Job): Promise<void> => {
    const payload = job.data as ProcessBulkPayoutPayload;
    // TODO: port the legacy bulkPayoutHandler business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESS_BULK_PAYOUT_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
