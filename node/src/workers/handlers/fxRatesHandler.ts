import { Job } from "bullmq";
import { logger } from "../../helpers/logger";
import { FxRatesJobPayload } from "../../queues/dispatchers";
import { prisma } from "../../db/prisma";
import { Massive } from "../../services/external/massive";
import { convertUsdRateToAed } from "../../services/quotes/aedOverride";
import { EXTERNAL_TYPE_MASSIVE } from "../../helpers/constants";

/**
 * Mirror of Laravel RefreshFxRatesJob. For each supported-country currency,
 * fetch the live USD rate from Massive and upsert two rows: one keyed
 * (USD -> currency), one keyed (AED -> currency) where the AED rate is
 * derived by dividing the USD rate by env('USD_TO_AED').
 *
 * Skipped currencies:
 *   - Same currency on both sides (USD->USD, AED->AED).
 */
export async function processFxRates(job: Job<FxRatesJobPayload>): Promise<void> {
  logger.info({ jobId: job.id, triggeredBy: job.data.triggeredBy }, "RefreshFxRatesJob started");

  const supported = await prisma().supportedCountry.findMany({
    where: { status: 1 },
    select: { currency: true },
  });
  const currencies = Array.from(new Set(supported.map((s) => s.currency)));
  const fromCurrencies: ("USD" | "AED")[] = ["USD", "AED"];

  for (const fromCurrency of fromCurrencies) {
    for (const currency of currencies) {
      if (fromCurrency === currency) continue;

      try {
        const response = await Massive.rate({
          amount: 1,
          from_currency: "USD",
          to_currency: currency,
        });
        if (!response.success || response.fx_rate === null) continue;

        const finalRate =
          fromCurrency === "AED"
            ? convertUsdRateToAed(response.fx_rate, currency)
            : response.fx_rate;

        await prisma().fxRate.upsert({
          where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
            fx_rate_pair: {
              fromCurrency,
              toCurrency: currency,
              provider: EXTERNAL_TYPE_MASSIVE,
            },
          },
          create: {
            fromCurrency,
            toCurrency: currency,
            provider: EXTERNAL_TYPE_MASSIVE,
            rate: String(finalRate),
          },
          update: { rate: String(finalRate) },
        });
      } catch (err) {
        logger.error(
          { err, fromCurrency, toCurrency: currency },
          "RefreshFxRatesJob upsert failed",
        );
      }
    }
  }

  logger.info({ jobId: job.id }, "RefreshFxRatesJob completed");
}
