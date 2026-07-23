import { JobsOptions } from "bullmq";
import { enqueueJob, QueueNames } from "../config";

/**
 * Producer for the deposit queue.
 *
 * NOTE: neither the legacy /node service nor the Laravel side defines a
 * deposit dispatcher today (deposit jobs originate elsewhere), so there
 * is no legacy job-name contract to preserve. "ProcessDeposit" follows
 * the Process* convention of the other queues; dedup on the deposit
 * transaction id.
 */

export interface DepositJobPayload {
    depositTransactionId: string;
    userId: string;
}

export const dispatchDeposit = (
    payload: DepositJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(QueueNames.Deposit, "ProcessDeposit", payload, {
        jobId: `deposit-${payload.depositTransactionId}`,
        ...options,
    });
