import { JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";
import { getBullConnection } from "../config/redis";

/**
 * Queue registry. One Queue instance per logical job stream.
 * Names match the Laravel job classes 1:1 so dashboards and alerts stay
 * meaningful during the migration.
 */

export const QueueNames = {
  Payout: "payout",
  Deposit: "deposit",
  Compliance: "compliance",
  Remittance: "remittance",
  BeneficiaryValidation: "beneficiary-validation",
  FxRates: "fx-rates",
  Callback: "callback",
  FvbankVa: "fvbank-va",
  Invoicemate: "invoicemate",
  BulkPayout: "bulk-payout",
  UserAlert: "user-alert",
  IdempotencyReaper: "idempotency-reaper",
  PayoutJobReaper: "payout-job-reaper",
  CheckBeneficiaryTxnStatus: "check-beneficiary-txn-status",
  DigineCountrySync: "diginine-country-sync",
  CalizaWebhook: "caliza-webhook",
  DiginineWebhook: "diginine-webhook",
  DebitNotification: "debit-notification",
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

const queues = new Map<QueueName, Queue>();

export async function getQueue(name: QueueName): Promise<Queue> {
  let q = queues.get(name);
  if (q) return q;
  const connection = await getBullConnection();
  q = new Queue(name, {
    connection,
    prefix: env().BULLMQ_PREFIX,
    defaultJobOptions: {
      attempts: env().BULLMQ_DEFAULT_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: env().BULLMQ_DEFAULT_BACKOFF_MS,
      },
      removeOnComplete: { count: 5_000, age: 60 * 60 * 24 * 7 },
      removeOnFail: { count: 10_000, age: 60 * 60 * 24 * 30 },
    } satisfies JobsOptions,
  });
  queues.set(name, q);
  return q;
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
