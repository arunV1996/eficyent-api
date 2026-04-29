import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { FxRatesJobPayload } from "../../queues/dispatchers";

/**
 * Mirror of Laravel RefreshFxRatesJob. Fetches FX rates from the configured
 * provider and upserts into fx_rates table. Wired up when the FX module is
 * converted.
 */
export async function processFxRates(job: Job<FxRatesJobPayload>): Promise<void> {
  logger.info(
    { jobId: job.id, triggeredBy: job.data.triggeredBy },
    "FX rates handler placeholder - implement when FX service is ported",
  );
}
