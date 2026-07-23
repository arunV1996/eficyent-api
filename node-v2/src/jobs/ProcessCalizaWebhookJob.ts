import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const PROCESS_CALIZA_WEBHOOK_JOB = "ProcessCalizaWebhook";

export interface ProcessCalizaWebhookPayload {
    data: Record<string, unknown>;
}

export const dispatchProcessCalizaWebhook = async (
    payload: ProcessCalizaWebhookPayload,
    options?: JobsOptions,
): Promise<string> => enqueue(PROCESS_CALIZA_WEBHOOK_JOB, payload, options);

export const executeProcessCalizaWebhook = async (
    job: Job,
): Promise<void> => {
    const payload = job.data as ProcessCalizaWebhookPayload;
    // TODO: port the legacy calizaWebhookHandler business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESS_CALIZA_WEBHOOK_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
