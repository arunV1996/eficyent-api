import { Job, JobsOptions } from "bullmq";
import { enqueue } from "./config";

export const REFRESH_FX_RATES_JOB = "RefreshFxRates";

export interface RefreshFxRatesPayload {
    triggeredBy: "cron" | "api";
}

export const dispatchRefreshFxRates = async (
    payload: RefreshFxRatesPayload,
    options?: JobsOptions,
): Promise<string> => enqueue(REFRESH_FX_RATES_JOB, payload, options);

export const executeRefreshFxRates = async (job: Job): Promise<void> => {
    const payload = job.data as RefreshFxRatesPayload;
    // TODO: port the legacy fxRatesHandler business logic here.
    // eslint-disable-next-line no-console
    console.log(
        `[job:${REFRESH_FX_RATES_JOB}] executing ${job.id}`,
        JSON.stringify(payload),
    );
};
