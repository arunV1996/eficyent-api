import { Worker } from "bullmq";
import { beneficiaryValidationWorker } from "./beneficiary_validation.worker";
import { bulkPayoutWorker } from "./bulk_payout.worker";
import { calizaWebhookWorker } from "./caliza_webhook.worker";
import { callbackWorker } from "./callback.worker";
import { complianceWorker } from "./compliance.worker";
import { debitNotificationWorker } from "./debit_notification.worker";
import { depositWorker } from "./deposit.worker";
import { diginineWebhookWorker } from "./diginine_webhook.worker";
import { fxRatesWorker } from "./fx_rates.worker";
import { payoutWorker } from "./payout.worker";
import { remittanceWorker } from "./remittance.worker";

/**
 * The whole consumer fleet, one Worker per queue. Importing this module
 * STARTS the workers (they connect to Redis on construction), so only
 * the dedicated worker entry point (src/worker.ts) should import it —
 * never the API server.
 */
export const allWorkers: Worker[] = [
    payoutWorker,
    bulkPayoutWorker,
    depositWorker,
    complianceWorker,
    remittanceWorker,
    beneficiaryValidationWorker,
    fxRatesWorker,
    callbackWorker,
    debitNotificationWorker,
    calizaWebhookWorker,
    diginineWebhookWorker,
];

export {
    beneficiaryValidationWorker,
    bulkPayoutWorker,
    calizaWebhookWorker,
    callbackWorker,
    complianceWorker,
    debitNotificationWorker,
    depositWorker,
    diginineWebhookWorker,
    fxRatesWorker,
    payoutWorker,
    remittanceWorker,
};
