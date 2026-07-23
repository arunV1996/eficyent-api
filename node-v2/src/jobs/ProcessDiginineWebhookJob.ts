import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const PROCESS_DIGININE_WEBHOOK_JOB = "ProcessDiginineWebhook";

export interface ProcessDiginineWebhookPayload {
    data: Record<string, unknown>;
}

export const dispatchProcessDiginineWebhook = async (
    payload: ProcessDiginineWebhookPayload,
    options?: JobsOptions,
): Promise<string> => enqueue(PROCESS_DIGININE_WEBHOOK_JOB, payload, options);

export const executeProcessDiginineWebhook = async (
    job: Job,
): Promise<void> => {
    const payload = job.data as ProcessDiginineWebhookPayload;
    // TODO: port the legacy diginineWebhookHandler business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESS_DIGININE_WEBHOOK_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
