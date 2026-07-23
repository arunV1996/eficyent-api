import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

/**
 * Laravel-style job: dispatchProcessPayout pushes it, the centralized
 * worker (src/worker.ts) routes job.name back to executeProcessPayout.
 * Job name and the payout-<id> dedup pattern match the legacy service.
 */

export const PROCESS_PAYOUT_JOB = "ProcessPayout";

export interface ProcessPayoutPayload {
    beneficiaryTransactionId?: string;
    payoutJobUniqueId: string;
    userId: string;
    source: "direct" | "instant" | "approval" | "bulk";
}

export const dispatchProcessPayout = async (
    payload: ProcessPayoutPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(PROCESS_PAYOUT_JOB, payload, {
        jobId: payload.beneficiaryTransactionId
            ? `payout-${payload.beneficiaryTransactionId}`
            : `payout-job-${payload.payoutJobUniqueId}`,
        ...options,
    });

export const executeProcessPayout = async (job: Job): Promise<void> => {
    const payload = job.data as ProcessPayoutPayload;
    // TODO: port the legacy payoutHandler business logic here. Until
    // then this stub only logs — do not point the worker at the shared
    // production Redis, the legacy fleet is the authoritative consumer.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESS_PAYOUT_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
