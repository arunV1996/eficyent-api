import { Job, JobsOptions } from "bullmq";
import PayoutTransaction from "../models/payout_transaction.model";
import { enqueue } from "./config";
import {
    createPayoutTransaction,
    CreatorContext,
} from "../helpers/payout_transaction.helper";
import User from "../models/user.model";
import {
    PAYOUT_TABLE_STATUS_COMPLETED,
    PAYOUT_TABLE_STATUS_FAILED,
    PAYOUT_TABLE_STATUS_PROCESSING,
} from "../utils/constants";

export const PROCESS_PAYOUT_JOB = "ProcessPayout";

export interface ProcessPayoutPayload {
    payoutTransactionId: number;
}

export const dispatchProcessPayoutTransaction = async (
    payload: ProcessPayoutPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(PROCESS_PAYOUT_JOB, payload, {
        jobId: `payout-process-${payload.payoutTransactionId}`,
        ...options,
    });

/**
 * Drains one queued PayoutTransaction (secondary DB) into a real
 * beneficiary transaction via createPayoutTransaction, marking the
 * queue row COMPLETED/FAILED accordingly.
 */
export const executeProcessPayoutTransaction = async (
    job: Job,
): Promise<void> => {
    const { payoutTransactionId } = job.data as ProcessPayoutPayload;

    const queue = await PayoutTransaction.findByPk(payoutTransactionId);
    if (!queue) {
        throw new Error(`PayoutTransaction ${payoutTransactionId} not found.`);
    }

    if (queue.payoutStatus === PAYOUT_TABLE_STATUS_COMPLETED) {
        // Idempotency.
        return;
    }

    await queue.update({
        payoutStatus: PAYOUT_TABLE_STATUS_PROCESSING,
        errorMessage: null,
    });

    try {
        // MariaDB JSON columns can come back as strings.
        const rawPayload = queue.payload;
        const jobPayload =
            typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
        const store = jobPayload?.store || {};

        const user = await User.findByPk(queue.userId);
        if (!user) {
            throw new Error("User not found");
        }

        // Emulate the creator context if creator_id was stored
        const creatorId = jobPayload?.creator_id;
        const creator: CreatorContext | null = creatorId
            ? { id: creatorId, role: 1 }
            : null;

        // Create the transaction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await createPayoutTransaction(store as any, user, creator);

        await queue.update({
            payoutStatus: PAYOUT_TABLE_STATUS_COMPLETED,
            processedAt: new Date(),
        });
    } catch (e) {
        await queue.update({
            payoutStatus: PAYOUT_TABLE_STATUS_FAILED,
            errorMessage: e instanceof Error ? e.message : "Unknown error",
        });
        throw e;
    }
};
