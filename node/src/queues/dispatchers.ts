import { JobsOptions } from "bullmq";
import { getQueue, QueueName, QueueNames } from "./queues";

/**
 * Typed dispatchers. Add one per job: this is the only place callers should
 * ever import from when enqueuing work, so the payload shapes are enforced.
 */

export interface PayoutJobPayload {
  beneficiaryTransactionId: string;
  payoutJobId: string;
  userId: string;
  source: "direct" | "instant" | "approval" | "bulk";
}

export interface CallbackJobPayload {
  url: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  externalReferenceId?: string;
}

export interface FxRatesJobPayload {
  triggeredBy: "cron" | "api";
}

async function enqueue(
  name: QueueName,
  jobName: string,
  data: unknown,
  opts?: JobsOptions,
): Promise<string> {
  const q = await getQueue(name);
  const job = await q.add(jobName, data, opts);
  return job.id ?? "";
}

export const Dispatch = {
  payout: (data: PayoutJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.Payout, "ProcessPayout", data, {
      jobId: `payout:${data.beneficiaryTransactionId}`,
      ...opts,
    }),

  bulkPayout: (data: { batchId: string; userId: string }, opts?: JobsOptions) =>
    enqueue(QueueNames.BulkPayout, "ProcessBulkPayout", data, {
      jobId: `bulk:${data.batchId}`,
      ...opts,
    }),

  callback: (data: CallbackJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.Callback, "SendCallback", data, opts),

  fxRates: (data: FxRatesJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.FxRates, "RefreshFxRates", data, opts),
};
