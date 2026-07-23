import { JobsOptions } from "bullmq";
import { enqueueJob, QueueNames } from "../config";

/**
 * Producer for the merchant callback queue (job name mirrors the
 * legacy "SendCallback"; no dedup id — every callback event queues).
 */

export interface CallbackJobPayload {
    userId: string;
    eventType: string;
    payload: Record<string, unknown>;
    beneficiaryTransactionUniqueId?: string;
    depositTransactionUniqueId?: string;
}

export const dispatchCallback = (
    payload: CallbackJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(QueueNames.Callback, "SendCallback", payload, options);
