import { JobsOptions } from "bullmq";
import { enqueueJob, QueueNames } from "../config";

/**
 * Producers for the provider webhook queues (Caliza / Diginine). Job
 * names mirror the legacy dispatchers; no dedup ids.
 */

export interface CalizaWebhookJobPayload {
    data: Record<string, unknown>;
}

export interface DiginineWebhookJobPayload {
    data: Record<string, unknown>;
}

export const dispatchCalizaWebhook = (
    payload: CalizaWebhookJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(
        QueueNames.CalizaWebhook,
        "ProcessCalizaWebhook",
        payload,
        options,
    );

export const dispatchDiginineWebhook = (
    payload: DiginineWebhookJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(
        QueueNames.DiginineWebhook,
        "ProcessDiginineWebhook",
        payload,
        options,
    );
