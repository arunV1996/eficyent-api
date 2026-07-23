import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const SEND_CALLBACK_JOB = "SendCallback";

export interface SendCallbackPayload {
    userId: string;
    eventType: string;
    payload: Record<string, unknown>;
    beneficiaryTransactionUniqueId?: string;
    depositTransactionUniqueId?: string;
}

export const dispatchSendCallback = async (
    payload: SendCallbackPayload,
    options?: JobsOptions,
): Promise<string> => enqueue(SEND_CALLBACK_JOB, payload, options);

export const executeSendCallback = async (job: Job): Promise<void> => {
    const payload = job.data as SendCallbackPayload;
    // TODO: port the legacy callbackHandler business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${SEND_CALLBACK_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
