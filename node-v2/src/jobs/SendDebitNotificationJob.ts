import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const SEND_DEBIT_NOTIFICATION_JOB = "SendDebitNotification";

export interface SendDebitNotificationPayload {
    beneficiaryTransactionId: string;
}

export const dispatchSendDebitNotification = async (
    payload: SendDebitNotificationPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(SEND_DEBIT_NOTIFICATION_JOB, payload, {
        jobId: `debit-${payload.beneficiaryTransactionId}`,
        ...options,
    });

export const executeSendDebitNotification = async (
    job: Job,
): Promise<void> => {
    const payload = job.data as SendDebitNotificationPayload;
    // TODO: port the legacy debitNotificationHandler business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${SEND_DEBIT_NOTIFICATION_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
