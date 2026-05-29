import { JobsOptions } from "bullmq";
import { getQueue, QueueName, QueueNames } from "./queues";

/**
 * Typed dispatchers. Add one per job: this is the only place callers should
 * ever import from when enqueuing work, so the payload shapes are enforced.
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

export interface CallbackJobPayload {
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
  beneficiaryTransactionUniqueId?: string;
  depositTransactionUniqueId?: string;
}

export interface FxRatesJobPayload {
  triggeredBy: "cron" | "api";
}

export interface CalizaWebhookJobPayload {
  data: Record<string, unknown>;
}

export interface DiginineWebhookJobPayload {
  data: Record<string, unknown>;
}

export interface DebitNotificationJobPayload {
  beneficiaryTransactionId: string;
}

export interface ComplianceBatchJobPayload {
  triggeredBy: "api" | "cron";
}

export interface RemittanceBatchJobPayload {
  triggeredBy: "api" | "cron";
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
      jobId: data.beneficiaryTransactionId
        ? `payout-${data.beneficiaryTransactionId}`
        : `payout-job-${data.payoutJobUniqueId}`,
      ...opts,
    }),

  bulkPayout: (data: BulkPayoutJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.BulkPayout, "ProcessBulkPayout", data, {
      jobId: `bulk-${data.payoutJobUniqueId}`,
      ...opts,
    }),

  callback: (data: CallbackJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.Callback, "SendCallback", data, opts),

  fxRates: (data: FxRatesJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.FxRates, "RefreshFxRates", data, opts),

  calizaWebhook: (data: CalizaWebhookJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.CalizaWebhook, "ProcessCalizaWebhook", data, opts),

  diginineWebhook: (data: DiginineWebhookJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.DiginineWebhook, "ProcessDiginineWebhook", data, opts),

  debitNotification: (data: DebitNotificationJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.DebitNotification, "SendDebitNotification", data, {
      jobId: `debit-${data.beneficiaryTransactionId}`,
      ...opts,
    }),

  complianceBatch: (data: ComplianceBatchJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.ComplianceBatch, "ExecuteComplianceBatch", data, {
      jobId: `compliance-batch-${Date.now()}`,
      ...opts,
    }),

  remittanceBatch: (data: RemittanceBatchJobPayload, opts?: JobsOptions) =>
    enqueue(QueueNames.RemittanceBatch, "ExecuteRemittanceBatch", data, {
      jobId: `remittance-batch-${Date.now()}`,
      ...opts,
    }),
};
