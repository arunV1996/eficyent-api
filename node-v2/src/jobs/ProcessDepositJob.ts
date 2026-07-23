import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const PROCESS_DEPOSIT_JOB = "ProcessDeposit";

export interface ProcessDepositPayload {
    depositTransactionId: string;
    userId: string;
}

export const dispatchProcessDeposit = async (
    payload: ProcessDepositPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(PROCESS_DEPOSIT_JOB, payload, {
        jobId: `deposit-${payload.depositTransactionId}`,
        ...options,
    });

export const executeProcessDeposit = async (job: Job): Promise<void> => {
    const payload = job.data as ProcessDepositPayload;
    // TODO: port the deposit processing business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESS_DEPOSIT_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
