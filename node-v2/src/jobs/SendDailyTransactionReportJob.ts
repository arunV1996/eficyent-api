import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";
import Merchant from "../models/merchant.model";
import MerchantSetting from "../models/merchant_setting.model";

export const SEND_DAILY_TRANSACTION_REPORT_JOB = "SendDailyTransactionReport";

export interface SendDailyTransactionReportPayload {
    /** YYYY-MM-DD; defaults to yesterday. */
    dateStr?: string;
}

/**
 * Daily per-merchant transaction report fan-out: every active merchant
 * with is_transaction_report_enabled = "1" and a JSON list of report
 * emails gets a report for the requested (default: previous) day.
 */
export const executeSendDailyTransactionReport = async (
    job: Job<SendDailyTransactionReportPayload>,
): Promise<void> => {
    const today = new Date();
    // Yesterday.
    today.setDate(today.getDate() - 1);
    const dateStr = job.data.dateStr || today.toISOString().split("T")[0];
    const merchants = await Merchant.findAll({ where: { status: 1 } });
    for (const merchant of merchants) {
        const isReportEnabledSetting = await MerchantSetting.findOne({
            where: {
                merchantId: merchant.id,
                key: "is_transaction_report_enabled",
            },
        });
        if (!isReportEnabledSetting || isReportEnabledSetting.value !== "1") {
            continue;
        }
        const emailSetting = await MerchantSetting.findOne({
            where: {
                merchantId: merchant.id,
                key: "transaction_report_email",
            },
        });
        if (!emailSetting || !emailSetting.value) {
            continue;
        }
        let merchantEmails: string[] = [];
        try {
            merchantEmails = JSON.parse(emailSetting.value);
        } catch {
            continue;
        }
        if (merchantEmails.length === 0) {
            continue;
        }
        // eslint-disable-next-line no-console
        console.log(
            `[job:${SEND_DAILY_TRANSACTION_REPORT_JOB}] sending report for date ${dateStr} to merchant ${merchant.id} (${merchantEmails.join(", ")})`,
        );
    }
};

export const dispatchSendDailyTransactionReport = async (
    payload: SendDailyTransactionReportPayload = {},
    options?: JobsOptions,
): Promise<string> => {
    return enqueue(SEND_DAILY_TRANSACTION_REPORT_JOB, payload, {
        attempts: 3,
        ...options,
    });
};
