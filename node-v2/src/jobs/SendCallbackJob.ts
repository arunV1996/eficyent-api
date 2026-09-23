import axios from "axios";
import crypto from "crypto";
import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import BeneficiaryTransactionStatusHistory from "../models/beneficiary_transaction_status_history.model";

export const SEND_CALLBACK_JOB = "SendCallback";

export interface SendCallbackPayload {
    userId: string;
    eventType: string;
    payload: Record<string, unknown>;
    beneficiaryTransactionUniqueId?: string;
    depositTransactionUniqueId?: string;
}

export const dispatchSendCallback = async (
    payload: SendCallbackPayload,
    options?: JobsOptions,
): Promise<string> => enqueue(SEND_CALLBACK_JOB, payload, options);

/**
 * Merchant webhook dispatcher (port of the legacy callbackHandler):
 * POSTs the event to the merchant's callback_url with an HMAC-SHA256
 * X-Signature over the exact JSON body, records the delivery outcome
 * on the transaction's status-history meta, and rethrows only network
 * failures so BullMQ retries transport errors but not deliberate HTTP
 * rejections.
 */
export const executeSendCallback = async (job: Job): Promise<void> => {
    const jobPayload = job.data as SendCallbackPayload;

    // eslint-disable-next-line no-console
    console.log(
        `[job:${SEND_CALLBACK_JOB}] executing ${job.id} for user ${jobPayload.userId}`,
    );
    try {
        const user = await User.findByPk(jobPayload.userId);
        // withSecrets: the default scope strips apiKey/saltKey, which
        // the HMAC signature needs.
        const merchant = user?.merchantId
            ? await Merchant.scope("withSecrets").findByPk(user.merchantId)
            : null;

        if (!merchant || !merchant.callbackUrl) {
            // eslint-disable-next-line no-console
            console.log(
                `[job:${SEND_CALLBACK_JOB}] Callback not configured for user ${jobPayload.userId}`,
            );
            return;
        }
        const callbackUrl = merchant.callbackUrl;
        const callbackData = {
            event: jobPayload.eventType,
            data: jobPayload.payload,
            timestamp: Math.floor(Date.now() / 1000),
        };
        const bodyJson = JSON.stringify(callbackData);
        // Sign the payload using HMAC SHA256 and the merchant's secret
        // key.
        const secret = merchant.saltKey || merchant.apiKey || "default_secret";
        const signature = crypto
            .createHmac("sha256", secret)
            .update(bodyJson)
            .digest("hex");
        let status: number | null = null;
        let success = false;
        let responseData: unknown = null;
        let reason: string | null = null;
        try {
            const response = await axios.post(callbackUrl, bodyJson, {
                headers: {
                    "Content-Type": "application/json",
                    "X-Signature": signature,
                },
                // 30 seconds timeout.
                timeout: 30000,
                // Don't throw on 4xx/5xx responses.
                validateStatus: () => true,
            });

            status = response.status;
            responseData = response.data;
            success = status >= 200 && status < 300;
        } catch (error) {
            reason = error instanceof Error ? error.message : String(error);
        }
        const logs = {
            url: callbackUrl,
            event: jobPayload.eventType,
            requested_at: new Date().toISOString(),
            status,
            response: responseData,
            send_callback: success ? "SUCCESS" : "FAILED",
            reason,
        };
        // eslint-disable-next-line no-console
        console.log(
            `[job:${SEND_CALLBACK_JOB}] Callback result:`,
            JSON.stringify(logs),
        );
        // Store callback logs in the transaction's history meta column.
        if (jobPayload.beneficiaryTransactionUniqueId) {
            const history = await BeneficiaryTransactionStatusHistory.findOne({
                where: { uniqueId: jobPayload.beneficiaryTransactionUniqueId },
            });
            if (history) {
                // MariaDB JSON columns come back as strings.
                let existingMeta: Record<string, unknown> = {};
                const rawMeta = history.meta;
                if (typeof rawMeta === "string") {
                    try {
                        existingMeta = JSON.parse(rawMeta);
                    } catch {
                        existingMeta = {};
                    }
                } else if (rawMeta && typeof rawMeta === "object") {
                    existingMeta = rawMeta as Record<string, unknown>;
                }
                history.meta = {
                    ...existingMeta,
                    callbackStatus: status,
                    callbackLogs: logs,
                };
                history.changed("meta", true);
                await history.save();
            }
        }

        // If it failed due to a network error (not a deliberate HTTP
        // rejection), throw to trigger BullMQ retries.
        if (!success && !status) {
            throw new Error(`Callback network failure: ${reason}`);
        }
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[job:${SEND_CALLBACK_JOB}] Unhandled error:`, error);
        throw error;
    }
};
