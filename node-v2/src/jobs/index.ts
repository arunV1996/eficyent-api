import { JobsOptions } from "bullmq";
import {
    dispatchProcessBulkPayout,
    ProcessBulkPayoutPayload,
} from "./ProcessBulkPayoutJob";
import {
    dispatchProcessCalizaWebhook,
    ProcessCalizaWebhookPayload,
} from "./ProcessCalizaWebhookJob";
import {
    dispatchProcessDeposit,
    ProcessDepositPayload,
} from "./ProcessDepositJob";
import {
    dispatchProcessDiginineWebhook,
    ProcessDiginineWebhookPayload,
} from "./ProcessDiginineWebhookJob";
import {
    dispatchProcessPayout,
    ProcessPayoutPayload,
} from "./ProcessPayoutJob";
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
 * Barrel for the Laravel-style jobs module. Each file under src/jobs/
 * is one job (interface + dispatch + execute); src/worker.ts is the
 * queue:work equivalent that routes job names to execute functions.
 * The Dispatch facade keeps the pre-refactor call sites unchanged.
 */

export { closeQueue, closeQueues, getQueue, queueName } from "./config";

export * from "./ProcessBulkPayoutJob";
export * from "./ProcessCalizaWebhookJob";
export * from "./ProcessDepositJob";
export * from "./ProcessDiginineWebhookJob";
export * from "./ProcessPayoutJob";
export * from "./RefreshFxRatesJob";
export * from "./SendCallbackJob";
export * from "./SendDebitNotificationJob";

export const Dispatch = {
    payout(
        payload: ProcessPayoutPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchProcessPayout(payload, options);
    },
    bulkPayout(
        payload: ProcessBulkPayoutPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchProcessBulkPayout(payload, options);
    },
    deposit(
        payload: ProcessDepositPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchProcessDeposit(payload, options);
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
