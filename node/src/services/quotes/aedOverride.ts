import { env } from "../../config/env";
import { QUOTE_TYPE_REVERSE } from "../../helpers/constants";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Helpers\\ViewHelper::convertUSDratetoAED.
 *
 * Massive only quotes USD as the source currency. AED rates are derived
 * from the USD rate by dividing by env('USD_TO_AED'), defaulting to 2.67
 * when not configured. Used in three call sites:
 *
 *   - LookupRepository::createFxRate  (lookupsController.refreshRates)
 *   - RefreshFxRatesJob::handle       (fxRatesHandler cron)
 *   - QuoteRepository::store          (quotesController buildResponse)
 *
 * Returns the AED-equivalent rate. Logs the derivation for traceability.
 */
export function convertUsdRateToAed(
  usdFxRate: number,
  toCurrency?: string,
): number {
  const usdToAed = env().USD_TO_AED;
  const aedRate = usdFxRate / usdToAed;
  logger.info(
    { toCurrency, usdFxRate, usdToAed, aedRate },
    "AED rate derived from USD rate",
  );
  return aedRate;
}

/**
 * Mirror of QuoteRepository::store AED block. Mutates a Massive driver
 * response so its rates and dependent amount/receiving_amount reflect AED
 * source instead of USD source. Returns a new object; does not mutate
 * input.
 */
export function applyAedOverrideToQuote<
  T extends {
    fx_rate: number;
    external_fx_rate: number;
    amount: number;
    receiving_amount: number;
    quote_type: string;
  },
>(driverResp: T, sourceCurrency: string): T {
  if (sourceCurrency.toUpperCase() !== "AED") return driverResp;
  const aedRate = round6(convertUsdRateToAed(driverResp.fx_rate));
  const next: T = {
    ...driverResp,
    fx_rate: aedRate,
    external_fx_rate: aedRate,
  };
  if (driverResp.quote_type === QUOTE_TYPE_REVERSE) {
    next.amount = round6(driverResp.receiving_amount * aedRate);
  } else {
    next.receiving_amount = round6(driverResp.amount / aedRate);
  }
  return next;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
