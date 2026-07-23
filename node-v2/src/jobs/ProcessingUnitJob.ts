import axios from "axios";
import { Job, JobsOptions } from "bullmq";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import PayoutJob from "../models/payout_job.model";
import {
    BENEFICIARY_TRANSACTION_COMPLETED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_PROCESSING,
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    PAYOUT_JOB_STATUS_PROCESSING,
} from "../utils/constants";
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

const processingUnitClient = () => {
    const baseUrl =
        process.env.EXTERNAL_PROCESSINGUNIT_URL ||
        process.env.PROCESSING_UNIT_URL ||
        "";
    return axios.create({
        baseURL: baseUrl.replace(/\/+$/, ""),
        timeout:
            parseInt(process.env.PROCESSING_UNIT_TIMEOUT_SEC || "90", 10) *
            1000,
        headers: {
            "Content-Type": "application/json",
            "x-api-key":
                process.env.EXTERNAL_PROCESSINGUNIT_API_KEY ||
                process.env.PROCESSING_UNIT_API_KEY ||
                "",
            "x-api-secret":
                process.env.EXTERNAL_PROCESSINGUNIT_API_SECRET ||
                process.env.PROCESSING_UNIT_API_SECRET ||
                "",
        },
    });
};

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

    try {
        const response = await processingUnitClient().post("/payouts", {
            reference_id: transaction.uniqueId,
            amount: transaction.amount,
            currency: transaction.receivingCurrency,
            user_id: payload.userId,
            payout_job_unique_id: payload.payoutJobUniqueId || undefined,
        });

        const isCompleted =
            String(
                (response.data as { status?: string })?.status ?? "",
            ).toUpperCase() === "COMPLETED";
        await transaction.update({
            status: isCompleted
                ? BENEFICIARY_TRANSACTION_COMPLETED
                : BENEFICIARY_TRANSACTION_PROCESSING,
        });
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] payout ${transaction.uniqueId} -> ${
                isCompleted ? "Completed" : "Processing"
            }`,
        );
    } catch (apiError) {
        await transaction.update({
            status: BENEFICIARY_TRANSACTION_FAILED,
        });
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] payout ${transaction.uniqueId} failed:`,
            apiError instanceof Error ? apiError.message : apiError,
        );
        throw apiError;
    }
};

const handleDeposit = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    const transaction = await DepositTransaction.findByPk(
        Number(payload.transactionId),
    );
    if (!transaction) {
        throw new Error(
            `Deposit transaction ${payload.transactionId} not found.`,
        );
    }

    try {
        const response = await processingUnitClient().post("/deposits", {
            reference_id: transaction.uniqueId,
            amount: transaction.amount,
            currency: transaction.depositCurrency,
            user_id: payload.userId,
        });

        const isCompleted =
            String(
                (response.data as { status?: string })?.status ?? "",
            ).toUpperCase() === "COMPLETED";
        await transaction.update({
            status: isCompleted
                ? DEPOSIT_TRANSACTION_COMPLETED
                : DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        });
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] deposit ${transaction.uniqueId} -> ${
                isCompleted ? "Completed" : "Processing"
            }`,
        );
    } catch (apiError) {
        await transaction.update({ status: DEPOSIT_TRANSACTION_FAILED });
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] deposit ${transaction.uniqueId} failed:`,
            apiError instanceof Error ? apiError.message : apiError,
        );
        throw apiError;
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
