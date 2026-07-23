import { JobsOptions } from "bullmq";
import { enqueueJob, QueueNames } from "../config";

/**
 * Producers for the payout + bulk-payout queues. Job names and jobId
 * dedup patterns mirror the legacy queues/dispatchers.ts exactly — the
 * legacy workers consume these queues from the shared Redis, so both
 * must stay byte-identical.
 */

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

export const dispatchPayout = (
    payload: PayoutJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(QueueNames.Payout, "ProcessPayout", payload, {
        jobId: payload.beneficiaryTransactionId
            ? `payout-${payload.beneficiaryTransactionId}`
            : `payout-job-${payload.payoutJobUniqueId}`,
        ...options,
    });

export const dispatchBulkPayout = (
    payload: BulkPayoutJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(QueueNames.BulkPayout, "ProcessBulkPayout", payload, {
        jobId: `bulk-${payload.payoutJobUniqueId}`,
        ...options,
    });
