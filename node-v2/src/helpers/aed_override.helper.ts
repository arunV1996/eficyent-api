import { QUOTE_TYPE_REVERSE } from "../utils/constants";

/**
 * Mirror of App\Helpers\ViewHelper::convertUSDratetoAED.
 *
 * Massive only quotes USD as the source currency. AED rates are
 * derived from the USD rate by dividing by env USD_TO_AED (default
 * 2.67 when not configured).
 */

const usdToAedDivisor = (): number => {
    const configuredDivisor = Number(process.env.USD_TO_AED);
    return Number.isFinite(configuredDivisor) && configuredDivisor > 0
        ? configuredDivisor
        : 2.67;
};

const round6 = (value: number): number => {
    return Math.round(value * 1_000_000) / 1_000_000;
};

export const convertUsdRateToAed = (usdFxRate: number): number => {
    return usdFxRate / usdToAedDivisor();
};

export interface AedOverridableQuote {
    fx_rate: number;
    external_fx_rate: number;
    amount: number;
    receiving_amount: number;
    quote_type: string;
}

/**
 * Mirror of the QuoteRepository::store AED block. Returns a new
 * driver-response object whose rates and dependent amounts reflect an
 * AED source instead of USD; non-AED sources pass through unchanged.
 */
export const applyAedOverrideToQuote = <T extends AedOverridableQuote>(
    driverResponse: T,
    sourceCurrency: string,
): T => {
    if (sourceCurrency.toUpperCase() !== "AED") {
        return driverResponse;
    }

    const aedRate = round6(convertUsdRateToAed(driverResponse.fx_rate));
    const overridden: T = {
        ...driverResponse,
        fx_rate: aedRate,
        external_fx_rate: aedRate,
    };
    if (driverResponse.quote_type === QUOTE_TYPE_REVERSE) {
        overridden.amount = round6(driverResponse.receiving_amount * aedRate);
    } else {
        overridden.receiving_amount = round6(driverResponse.amount / aedRate);
    }
    return overridden;
};
