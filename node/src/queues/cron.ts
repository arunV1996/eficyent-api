import os from "os";
import { env } from "../config/env";
import { logger } from "../helpers/logger";
import { getQueue, QueueName, QueueNames } from "./queues";

/**
 * Cron registration. Runs once per process. BullMQ deduplicates repeat jobs
 * by jobId, so even if every worker registers the schedule, only one run
 * executes per slot - but to keep Redis clean we can opt into a "leader" host.
 */

interface CronDef {
  queue: QueueName;
  jobName: string;
  pattern: string;
  data?: Record<string, unknown>;
}

function shouldRegister(): boolean {
  const leader = env().CRON_LEADER_HOST;
  if (!leader) return true;
  return os.hostname() === leader;
}

const definitions: CronDef[] = [
  {
    queue: QueueNames.FxRates,
    jobName: "RefreshFxRates",
    pattern: env().CRON_FX_RATES,
    data: { triggeredBy: "cron" },
  },
  {
    queue: QueueNames.CheckBeneficiaryTxnStatus,
    jobName: "CheckBeneficiaryTxnStatus",
    pattern: env().CRON_CHECK_BENEFICIARY_TXN_STATUS,
  },
  {
    queue: QueueNames.DigineCountrySync,
    jobName: "SyncDiginineCountries",
    pattern: env().CRON_DIGININE_COUNTRY_SYNC,
  },
  {
    queue: QueueNames.FvbankVa,
    jobName: "FetchFvBankVirtualAccounts",
    pattern: env().CRON_FETCH_FVBANK_VA,
  },
  {
    queue: QueueNames.PayoutJobReaper,
    jobName: "PayoutJobReaper",
    pattern: env().CRON_PAYOUT_JOB_REAPER,
  },
];

export async function registerCrons(): Promise<void> {
  if (!shouldRegister()) {
    logger.info(
      { hostname: os.hostname(), leader: env().CRON_LEADER_HOST },
      "Skipping cron registration (not leader)",
    );
    return;
  }

  for (const def of definitions) {
    const q = await getQueue(def.queue);
    const repeatKey = `${def.jobName}:${def.pattern}`;
    await q.add(def.jobName, def.data ?? {}, {
      repeat: { pattern: def.pattern },
      jobId: repeatKey,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    });
    logger.info(
      { queue: def.queue, jobName: def.jobName, pattern: def.pattern },
      "Cron registered",
    );
  }
}
