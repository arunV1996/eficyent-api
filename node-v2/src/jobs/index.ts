import { JobsOptions } from "bullmq";
import {
    dispatchCallback,
    CallbackJobPayload,
} from "./dispatchers/callback.dispatcher";
import {
    dispatchDeposit,
    DepositJobPayload,
} from "./dispatchers/deposit.dispatcher";
import {
    dispatchFxRates,
    FxRatesJobPayload,
} from "./dispatchers/fx_rates.dispatcher";
import {
    dispatchDebitNotification,
    DebitNotificationJobPayload,
} from "./dispatchers/notification.dispatcher";
import {
    dispatchBulkPayout,
    dispatchPayout,
    BulkPayoutJobPayload,
    PayoutJobPayload,
} from "./dispatchers/payout.dispatcher";
import {
    dispatchCalizaWebhook,
    dispatchDiginineWebhook,
    CalizaWebhookJobPayload,
    DiginineWebhookJobPayload,
} from "./dispatchers/webhook.dispatcher";

/**
 * Barrel for the jobs module. The queue plumbing lives in ./config,
 * producers live under ./dispatchers, consumers under ./workers (only
 * ever imported by src/worker.ts). The Dispatch object keeps the
 * pre-refactor call sites working unchanged.
 */

export { closeQueues, getQueue, QueueNames } from "./config";
export type { QueueName } from "./config";

export {
    dispatchBulkPayout,
    dispatchCallback,
    dispatchCalizaWebhook,
    dispatchDebitNotification,
    dispatchDeposit,
    dispatchDiginineWebhook,
    dispatchFxRates,
    dispatchPayout,
};
export type {
    BulkPayoutJobPayload,
    CallbackJobPayload,
    CalizaWebhookJobPayload,
    DebitNotificationJobPayload,
    DepositJobPayload,
    DiginineWebhookJobPayload,
    FxRatesJobPayload,
    PayoutJobPayload,
};

// Aggregated dispatcher facade — method names, queue names, job names,
// and dedup ids are identical to the pre-refactor monolith.
export const Dispatch = {
    payout(
        payload: PayoutJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchPayout(payload, options);
    },
    bulkPayout(
        payload: BulkPayoutJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchBulkPayout(payload, options);
    },
    deposit(
        payload: DepositJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchDeposit(payload, options);
    },
    callback(
        payload: CallbackJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchCallback(payload, options);
    },
    fxRates(
        payload: FxRatesJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchFxRates(payload, options);
    },
    calizaWebhook(
        payload: CalizaWebhookJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchCalizaWebhook(payload, options);
    },
    diginineWebhook(
        payload: DiginineWebhookJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchDiginineWebhook(payload, options);
    },
    debitNotification(
        payload: DebitNotificationJobPayload,
        options?: JobsOptions,
    ): Promise<string> {
        return dispatchDebitNotification(payload, options);
    },
};
