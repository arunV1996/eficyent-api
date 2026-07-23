import { JobsOptions } from "bullmq";
import { enqueueJob, QueueNames } from "../config";

/**
 * Producer for the debit-notification queue (job name and debit-<id>
 * dedup mirror the legacy dispatcher).
 */

export interface DebitNotificationJobPayload {
    beneficiaryTransactionId: string;
}

export const dispatchDebitNotification = (
    payload: DebitNotificationJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(
        QueueNames.DebitNotification,
        "SendDebitNotification",
        payload,
        {
            jobId: `debit-${payload.beneficiaryTransactionId}`,
            ...options,
        },
    );
