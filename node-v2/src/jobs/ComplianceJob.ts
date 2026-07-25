import axios from "axios";
import { Job, JobsOptions } from "bullmq";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import Sender from "../models/sender.model";
import User from "../models/user.model";
import { make as makeCompliance } from "../services/compliance.service";
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
    const user = await User.findByPk(Number(payload.userId));
    if (!user) {
        throw new Error(`User ${payload.userId} not found.`);
    }

    // eslint-disable-next-line no-console
    console.log(
        `[job:${COMPLIANCE_JOB}] Started screening transaction ${payload.transactionId}`,
    );

    try {
        // Full ported Compliance submission: quote lookup, payload
        // build, upstream call, status mapping + history.
        await makeCompliance(transaction, user);
        // eslint-disable-next-line no-console
        console.log(
            `[job:${COMPLIANCE_JOB}] Successfully screened transaction ${payload.transactionId}`,
        );
    } catch (serviceError) {
        // eslint-disable-next-line no-console
        console.error(
            `[job:${COMPLIANCE_JOB}] Screening ${payload.transactionId} failed:`,
            serviceError instanceof Error
                ? serviceError.message
                : serviceError,
        );
        throw serviceError;
    }
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
