import * as constants from "../utils/constants";
import Currency from "../models/currency.model";
import { getCryptoRate } from "../services/kraken.service";
import { getFiatRate } from "../services/opener.service";

/**
 * Determines the currency type (crypto or fiat) using the wallet object,
 * looking it up from its associated currency details.
 */
const getCurrencyType = async (wallet: any): Promise<string> => {
    let currency = wallet.currencyDetail;
    if (!currency) {
        currency = await Currency.findOne({ where: { code: wallet.currency } });
    }
    if (!currency) {
        throw new Error(
            `Currency definition not found for code: ${wallet.currency}`,
        );
    }
    return currency.type;
};

/**
 * Resolves Crypto -> USD rate via Kraken Service.
 */
const getCryptoToUsdRate = async (cryptoCode: string): Promise<number> => {
    const data = await getCryptoRate(cryptoCode.toUpperCase());
    const result = data.result;
    const pairKey = Object.keys(result)[0];
    return parseFloat(result[pairKey].c[0]);
};

/**
 * Resolves USD -> Fiat rate via Opener Service.
 */
const getUsdToFiatRate = async (fiatCode: string): Promise<number> => {
    const data = await getFiatRate("USD");
    const rate = data.rates[fiatCode.toUpperCase()];
    if (!rate) {
        throw new Error(`Rate not found for currency ${fiatCode}`);
    }
    return parseFloat(rate);
};

/**
 * Calculates exchange rate between from and to wallets.
 * - Kraken API only supports Crypto to USD.
 * - Opener API only supports USD to Fiat.
 */
export const getExchangeRate = async (
    amount: any,
    from: any, // Wallet object
    to: any, // Wallet object
): Promise<number> => {
    const fromCode = String(from.currency).toUpperCase();
    const toCode = String(to.currency).toUpperCase();

    if (fromCode === toCode) {
        return 1.0;
    }

    const fromType = await getCurrencyType(from);
    const toType = await getCurrencyType(to);

    let rate = 1.0;

    if (fromType === constants.CURRENCY_TYPE_CRYPTO && toCode === "USD") {
        // Case: Crypto -> USD (Kraken)
        rate = await getCryptoToUsdRate(fromCode);
    } else if (fromCode === "USD" && toType === constants.CURRENCY_TYPE_FIAT) {
        // Case: USD -> Fiat (Opener)
        rate = await getUsdToFiatRate(toCode);
    } else if (
        fromType === constants.CURRENCY_TYPE_CRYPTO &&
        toType === constants.CURRENCY_TYPE_FIAT
    ) {
        // Case: Crypto -> Fiat (Crypto -> USD -> Fiat)
        const cryptoToUsd = await getCryptoToUsdRate(fromCode);
        const usdToFiat = await getUsdToFiatRate(toCode);
        rate = cryptoToUsd * usdToFiat;
    } else if (
        fromType === constants.CURRENCY_TYPE_FIAT &&
        toCode === "USD"
    ) {
        // Case: Fiat -> USD (1 / (USD -> Fiat))
        const usdToFiat = await getUsdToFiatRate(fromCode);
        rate = 1.0 / usdToFiat;
    } else if (
        fromType === constants.CURRENCY_TYPE_FIAT &&
        toType === constants.CURRENCY_TYPE_CRYPTO
    ) {
        // Case: Fiat -> Crypto (Fiat -> USD -> Crypto)
        const usdToFiat = await getUsdToFiatRate(fromCode);
        const cryptoToUsd = await getCryptoToUsdRate(toCode);
        rate = (1.0 / usdToFiat) * (1.0 / cryptoToUsd);
    } else if (
        fromType === constants.CURRENCY_TYPE_CRYPTO &&
        toType === constants.CURRENCY_TYPE_CRYPTO
    ) {
        // Case: Crypto1 -> Crypto2 (Crypto1 -> USD -> Crypto2)
        const crypto1ToUsd = await getCryptoToUsdRate(fromCode);
        const crypto2ToUsd = await getCryptoToUsdRate(toCode);
        rate = crypto1ToUsd / crypto2ToUsd;
    } else if (
        fromType === constants.CURRENCY_TYPE_FIAT &&
        toType === constants.CURRENCY_TYPE_FIAT
    ) {
        // Case: Fiat1 -> Fiat2 (Fiat1 -> USD -> Fiat2)
        const usdToFiat1 = await getUsdToFiatRate(fromCode);
        const usdToFiat2 = await getUsdToFiatRate(toCode);
        rate = usdToFiat2 / usdToFiat1;
    }

    return rate;
};
