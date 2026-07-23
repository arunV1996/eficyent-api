import { JobsOptions } from "bullmq";
import { enqueueJob, QueueNames } from "../config";

/**
 * Producer for the fx-rates refresh queue (job name mirrors the legacy
 * "RefreshFxRates" dispatcher used by the legacy cron).
 */

export interface FxRatesJobPayload {
    triggeredBy: "cron" | "api";
}

export const dispatchFxRates = (
    payload: FxRatesJobPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueueJob(QueueNames.FxRates, "RefreshFxRates", payload, options);
