import { JobsOptions } from "bullmq";
import {
    dispatchCompliance,
    CompliancePayload,
} from "./ComplianceJob";
import {
    dispatchProcessCalizaWebhook,
    ProcessCalizaWebhookPayload,
} from "./ProcessCalizaWebhookJob";
import {
    dispatchProcessDiginineWebhook,
    ProcessDiginineWebhookPayload,
} from "./ProcessDiginineWebhookJob";
import {
    dispatchProcessingUnit,
    ProcessingUnitPayload,
} from "./ProcessingUnitJob";
import {
    dispatchRefreshFxRates,
    RefreshFxRatesPayload,
} from "./RefreshFxRatesJob";
import {
    dispatchSendCallback,
    SendCallbackPayload,
} from "./SendCallbackJob";
import {
    dispatchSendDebitNotification,
    SendDebitNotificationPayload,
} from "./SendDebitNotificationJob";

/**
 * Barrel for the jobs module — jobs are grouped by EXTERNAL SYSTEM
 * (ProcessingUnit, Compliance, webhooks, callbacks, FX, notifications),
 * not by user action. src/worker.ts routes job names to execute
 * functions. The Dispatch facade keeps the pre-refactor controller
 * call sites compiling unchanged: payout/deposit/bulkPayout map their
 * legacy argument shapes into a ProcessingUnitPayload.
 */

export { closeQueue, closeQueues, getQueue, queueName } from "./config";

export * from "./ComplianceJob";
export * from "./ProcessCalizaWebhookJob";
export * from "./ProcessDiginineWebhookJob";
export * from "./ProcessingUnitJob";
export * from "./RefreshFxRatesJob";
export * from "./SendCallbackJob";
export * from "./SendDebitNotificationJob";

// Legacy argument shapes accepted by the Dispatch facade.
export interface PayoutDispatchArgs {
    beneficiaryTransactionId?: string;
    payoutJobUniqueId: string;
    userId: string;
    source: "direct" | "instant" | "approval" | "bulk";
}

export interface BulkPayoutDispatchArgs {
    payoutJobUniqueId: string;
    userId: string;
}

export interface DepositDispatchArgs {
    depositTransactionUniqueId: string;
}

export const Dispatch = {
    payout(
        payload: PayoutDispatchArgs,
        options?: JobsOptions,
    ): Promise<string> {
        const processingUnitPayload: ProcessingUnitPayload = {
            action: "payout",
            transactionId: payload.beneficiaryTransactionId ?? "",
            userId: payload.userId,
            payoutJobUniqueId: payload.payoutJobUniqueId,
        };
        return dispatchProcessingUnit(processingUnitPayload, options);
    },
    bulkPayout(
        payload: BulkPayoutDispatchArgs,
        options?: JobsOptions,
    ): Promise<string> {
        const processingUnitPayload: ProcessingUnitPayload = {
            action: "bulk_payout",
            transactionId: "",
            userId: payload.userId,
            payoutJobUniqueId: payload.payoutJobUniqueId,
        };
        return dispatchProcessingUnit(processingUnitPayload, options);
    },
    deposit(
        payload: DepositDispatchArgs,
        options?: JobsOptions,
    ): Promise<string> {
        const processingUnitPayload: ProcessingUnitPayload = {
            action: "deposit",
            transactionId: payload.depositTransactionUniqueId,
            userId: "",
            payoutJobUniqueId: "",
        };
        return dispatchProcessingUnit(processingUnitPayload, options);
    },
    compliance(
        payload: CompliancePayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchCompliance(payload, options);
    },
    callback(
        payload: SendCallbackPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchSendCallback(payload, options);
    },
    fxRates(
        payload: RefreshFxRatesPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchRefreshFxRates(payload, options);
    },
    calizaWebhook(
        payload: ProcessCalizaWebhookPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchProcessCalizaWebhook(payload, options);
    },
    diginineWebhook(
        payload: ProcessDiginineWebhookPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchProcessDiginineWebhook(payload, options);
    },
    debitNotification(
        payload: SendDebitNotificationPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchSendDebitNotification(payload, options);
    },
};
