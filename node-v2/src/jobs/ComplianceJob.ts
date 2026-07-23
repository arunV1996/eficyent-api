import axios from "axios";
import { Job, JobsOptions } from "bullmq";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import Sender from "../models/sender.model";
import {
    BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
} from "../utils/constants";
import { enqueue } from "./config";

/**
 * External-system job: every interaction with the Compliance screening
 * API rides this single job, discriminated by payload.action.
 */

export const COMPLIANCE_JOB = "Compliance";

export interface CompliancePayload {
    action: "screen_transaction" | "screen_user";
    transactionId?: string;
    senderId?: string;
    userId: string;
}

export const dispatchCompliance = async (
    payload: CompliancePayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(COMPLIANCE_JOB, payload, {
        jobId:
            payload.action === "screen_transaction"
                ? `compliance-trx-${payload.transactionId}`
                : `compliance-user-${payload.senderId ?? payload.userId}`,
        ...options,
    });

const complianceClient = () =>
    axios.create({
        baseURL: (process.env.EXTERNAL_COMPLIANCE_URL || "").replace(
            /\/+$/,
            "",
        ),
        timeout: 60_000,
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.EXTERNAL_COMPLIANCE_API_KEY || "",
        },
    });

const isSuspicious = (responseData: unknown): boolean =>
    String(
        (responseData as { result?: string })?.result ?? "",
    ).toUpperCase() === "SUSPICIOUS";

const handleTransactionScreening = async (
    payload: CompliancePayload,
): Promise<void> => {
    const transaction = await BeneficiaryTransaction.findByPk(
        Number(payload.transactionId),
    );
    if (!transaction) {
        throw new Error(
            `Beneficiary transaction ${payload.transactionId} not found.`,
        );
    }

    const response = await complianceClient().post("/screening/transaction", {
        reference_id: transaction.uniqueId,
        amount: transaction.amount,
        currency: transaction.receivingCurrency,
        user_id: payload.userId,
    });

    if (isSuspicious(response.data)) {
        await transaction.update({
            status: BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
        });
        // eslint-disable-next-line no-console
        console.warn(
            `[job:${COMPLIANCE_JOB}] transaction ${transaction.uniqueId} flagged Suspicious -> status Hold`,
        );
        return;
    }
    // eslint-disable-next-line no-console
    console.log(
        `[job:${COMPLIANCE_JOB}] transaction ${transaction.uniqueId} screening passed`,
    );
};

const handleUserScreening = async (
    payload: CompliancePayload,
): Promise<void> => {
    const sender = await Sender.findByPk(Number(payload.senderId));
    if (!sender) {
        throw new Error(`Sender ${payload.senderId} not found.`);
    }

    const response = await complianceClient().post("/screening/user", {
        reference_id: sender.uniqueId,
        user_id: payload.userId,
    });

    if (isSuspicious(response.data)) {
        // Deactivate the sender pending manual review.
        await sender.update({ status: 0 });
        // eslint-disable-next-line no-console
        console.warn(
            `[job:${COMPLIANCE_JOB}] sender ${sender.uniqueId} flagged Suspicious -> deactivated`,
        );
        return;
    }
    // eslint-disable-next-line no-console
    console.log(
        `[job:${COMPLIANCE_JOB}] sender ${sender.uniqueId} screening passed`,
    );
};

export const executeCompliance = async (job: Job): Promise<void> => {
    const payload = job.data as CompliancePayload;
    switch (payload.action) {
        case "screen_transaction":
            return handleTransactionScreening(payload);
        case "screen_user":
            return handleUserScreening(payload);
        default:
            throw new Error(
                `Unknown Compliance action "${String(
                    (payload as { action?: string }).action,
                )}".`,
            );
    }
};
