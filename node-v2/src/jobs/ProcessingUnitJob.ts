import { Job, JobsOptions } from "bullmq";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import PayoutJob from "../models/payout_job.model";
import User from "../models/user.model";
import {
    createDeposit,
    make as makePayout,
} from "../services/processing_unit.service";
import { PAYOUT_JOB_STATUS_PROCESSING } from "../utils/constants";
import { enqueue } from "./config";

/**
 * External-system job: every interaction with the Processing Unit API
 * (payouts, deposits, bulk payout orchestration) rides this single job,
 * discriminated by payload.action.
 */

export const PROCESSING_UNIT_JOB = "ProcessingUnit";

export interface ProcessingUnitPayload {
    action: "payout" | "deposit" | "bulk_payout";
    transactionId: string;
    userId: string;
    payoutJobUniqueId: string;
}

const dedupJobId = (payload: ProcessingUnitPayload): string => {
    switch (payload.action) {
        case "payout":
            return payload.transactionId
                ? `payout-${payload.transactionId}`
                : `payout-job-${payload.payoutJobUniqueId}`;
        case "deposit":
            return `deposit-${payload.transactionId}`;
        case "bulk_payout":
            return `bulk-${payload.payoutJobUniqueId}`;
    }
};

export const dispatchProcessingUnit = async (
    payload: ProcessingUnitPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(PROCESSING_UNIT_JOB, payload, {
        jobId: dedupJobId(payload),
        ...options,
    });

const handlePayout = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    const transaction = await BeneficiaryTransaction.findByPk(
        Number(payload.transactionId),
    );
    if (!transaction) {
        throw new Error(
            `Beneficiary transaction ${payload.transactionId} not found.`,
        );
    }
    const user = await User.findByPk(Number(payload.userId));
    if (!user) {
        throw new Error(`User ${payload.userId} not found.`);
    }

    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESSING_UNIT_JOB}] Started processing payout ${payload.transactionId}`,
    );

    try {
        await makePayout(transaction, user);
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] Successfully completed payout ${payload.transactionId}`,
        );
    } catch (serviceError) {
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] Payout ${payload.transactionId} failed:`,
            serviceError instanceof Error ? serviceError.message : serviceError,
        );
        throw serviceError;
    }
};

const handleDeposit = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESSING_UNIT_JOB}] Started processing deposit ${payload.transactionId}`,
    );

    // The controller dispatches the row's unique_id; numeric ids are
    // still accepted for direct/legacy dispatches.
    const transaction = /^\d+$/.test(payload.transactionId)
        ? await DepositTransaction.findByPk(Number(payload.transactionId))
        : await DepositTransaction.findOne({
              where: { uniqueId: payload.transactionId },
          });
    if (!transaction) {
        throw new Error(
            `Deposit transaction ${payload.transactionId} not found.`,
        );
    }

    try {
        // Full ported ProcessingUnit initiation: payload build, upstream
        // call, status mapping + history, merchant callback enqueue.
        await createDeposit(transaction);
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] Successfully completed deposit ${payload.transactionId}`,
        );
    } catch (serviceError) {
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] Deposit ${payload.transactionId} failed:`,
            serviceError instanceof Error
                ? serviceError.message
                : serviceError,
        );
        throw serviceError;
    }
};

const handleBulkPayout = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    const payoutJob = await PayoutJob.findOne({
        where: { uniqueId: payload.payoutJobUniqueId },
    });
    if (!payoutJob) {
        throw new Error(
            `Payout job ${payload.payoutJobUniqueId} not found.`,
        );
    }
    await payoutJob.update({ status: PAYOUT_JOB_STATUS_PROCESSING });
    // TODO: fan the payout job's rows out as individual "payout"
    // dispatches once the bulk row-linkage is ported.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESSING_UNIT_JOB}] bulk payout ${payload.payoutJobUniqueId} marked processing`,
    );
};

export const executeProcessingUnit = async (job: Job): Promise<void> => {
    const payload = job.data as ProcessingUnitPayload;
    switch (payload.action) {
        case "payout":
            return handlePayout(payload);
        case "deposit":
            return handleDeposit(payload);
        case "bulk_payout":
            return handleBulkPayout(payload);
        default:
            throw new Error(
                `Unknown ProcessingUnit action "${String(
                    (payload as { action?: string }).action,
                )}".`,
            );
    }
};
