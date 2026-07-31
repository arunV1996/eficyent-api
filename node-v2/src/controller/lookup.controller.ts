import { Request, Response } from "express";
import { convertUsdRateToAed } from "../helpers/aed_override.helper";
import { getFixedRate } from "../helpers/commission.helper";
import {
    countries as buildCountries,
    formatPaymentType,
    mobileCountryCodes as buildMobileCountryCodes,
    rates as buildRates,
    receivingCountries as buildReceivingCountries,
    getPaymentRails,
    serviceBanks,
    states as buildStates,
} from "../helpers/lookup.helper";
import { settingGet } from "../helpers/setting.helper";
import AdminWallet from "../models/admin_wallet.model";
import FxRate from "../models/fx_rate.model";
import MobileCountryCode from "../models/mobile_country_code.model";
import SupportedCountry from "../models/supported_country.model";
import { getRate as massiveGetRate } from "../services/massive.service";
import { getFlagUrl, relativeTime } from "../utils/common.utils";
import {
    DEPOSIT_PURPOSE,
    DEPOSIT_SOURCE_OF_FUNDS,
    EXTERNAL_TYPE_DIGININE,
    LOOKUP_TYPE_SOURCE_OF_FUNDS,
    USER_TYPE_MAP,
} from "../utils/constants";

/**
 * Mirror of the legacy Api\LookupsController public endpoints.
 *
 * The legacy controller responds with sendResponse(res, "", "", data),
 * which serializes to {status: true, code: "", message: "", data} —
 * we call res.sendResponse(data, "", "") to keep that envelope
 * byte-identical.
 */

/**
 * GET /api/user/lookups/mobile_country_codes
 */
export const mobileCountryCodes = async (
    _req: Request,
    res: Response,
): Promise<void> => {
    try {
        return res.sendResponse(
            { mobile_country_codes: await buildMobileCountryCodes() },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/countries
 */
export const countries = async (
    _req: Request,
    res: Response,
): Promise<void> => {
    try {
        return res.sendResponse({ countries: await buildCountries() }, "", "");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/states?country_code=IND
 */
export const states = async (req: Request, res: Response): Promise<void> => {
    try {
        const { country_code: countryCode } = req.query as {
            country_code?: string;
        };
        return res.sendResponse(
            { states: await buildStates(countryCode) },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/payment_rails
 */
export const paymentRails = (req: Request, res: Response): void => {
    try {
        const country = req.query.country as string | undefined;
        return res.sendResponse(
            { payment_rails: getPaymentRails(country) },
            "",
            "",
        );
    } catch (error) {
        const codedError = error as { message?: string; code?: number };
        return res.sendError(
            codedError.message ?? "Server error",
            codedError.code || 500,
            500,
        );
    }
};

/**
 * GET /api/user/lookups/banks?country_code=IND&currency=INR
 */
export const banks = async (req: Request, res: Response): Promise<void> => {
    try {
        const { country_code: countryCode } = req.query as {
            country_code: string;
        };

        // Resolve the provider from the corridor instead of blindly
        // defaulting to Diginine — IME/MOBI countries would otherwise
        // match zero rows.
        const supportedCountry = await SupportedCountry.findOne({
            where: { countryCode },
        });
        let externalType: string | null =
            supportedCountry?.externalType ?? EXTERNAL_TYPE_DIGININE;

        // These Asian corridors store their banks with a NULL
        // external_type ("N/A" records), so force the filter to null.
        if (
            ["CNY", "THB", "SGD"].includes(supportedCountry?.currency ?? "") ||
            ["CHN", "THA", "SGP"].includes(countryCode)
        ) {
            externalType = null;
        }

        return res.sendResponse(
            { banks: await serviceBanks(countryCode, undefined, externalType) },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/receiving_countries?recipient_type=PERSONAL|BUSINESS
 */
export const receivingCountries = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const recipientType = USER_TYPE_MAP[String(req.query.recipient_type)];
        const paymentType = formatPaymentType(
            req.user.userType,
            recipientType,
        );
        const supportedCountries = await buildReceivingCountries(
            paymentType,
            req.user,
        );

        let defaultCountry = await settingGet<string>(
            "quote_default_to_country",
            "IND",
        );
        let defaultCurrency = "";
        if (supportedCountries.length > 0) {
            const countryCodes = supportedCountries.map(
                (country) => country.country_code,
            );
            if (!countryCodes.includes(defaultCountry)) {
                defaultCountry =
                    supportedCountries[0]?.country_code ?? defaultCountry;
            }
            const defaultCountryPosition = countryCodes.indexOf(defaultCountry);
            const defaultCountryCurrencies =
                defaultCountryPosition >= 0
                    ? supportedCountries[defaultCountryPosition]?.currencies ??
                      []
                    : [];
            defaultCurrency = defaultCountryCurrencies[0] ?? "";
        }
        const defaultAmount = await settingGet<string>(
            "quote_default_from_amount",
            "100",
        );

        return res.sendResponse(
            {
                receiving_countries: supportedCountries,
                defaults: {
                    country: defaultCountry,
                    currency: defaultCurrency,
                    amount: Number(defaultAmount),
                },
            },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/get-rates?search_key=...
 *
 * Note: legacy passes user.timezone ?? "Asia/Kolkata" to relativeTime
 * for last_updated; both implementations currently ignore the timezone
 * (the output is purely relative), so node-v2's single-Date signature
 * is behaviorally identical. Revisit if relative-time formatting ever
 * becomes timezone-sensitive.
 */
export const getRates = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }
        const { search_key: searchKey } = req.query as {
            search_key?: string;
        };
        return res.sendResponse(
            { rates: await buildRates(req.user, searchKey) },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/lookups/refresh-rates
 *
 * Live-refreshes the cached fx_rates row for a currency pair. Massive
 * only quotes USD as source; AED rates are derived by dividing the USD
 * rate by env USD_TO_AED. Provider failures fall back to the fees
 * table's FIXED fx override (User -> Merchant -> global), mirroring
 * LookupRepository::createFxRate.
 */
export const refreshRates = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const fromCurrency = String(req.body.from_currency).toUpperCase();
        const toCurrency = String(req.body.to_currency).toUpperCase();

        const supportedCountry = await SupportedCountry.findOne({
            where: { currency: toCurrency, status: 1 },
        });
        if (!supportedCountry) {
            return res.sendError(res.__("189"), 189, 400);
        }

        let finalRate: number;
        let finalFromCurrency: string;

        try {
            const providerRate = await massiveGetRate({
                amount: 1,
                from_currency: "USD",
                to_currency: toCurrency,
            });
            if (!providerRate.success || providerRate.fx_rate === null) {
                throw new Error("Provider rate empty");
            }
            const isAedSource = fromCurrency === "AED";
            finalRate = isAedSource
                ? convertUsdRateToAed(providerRate.fx_rate)
                : providerRate.fx_rate;
            finalFromCurrency = isAedSource
                ? "AED"
                : providerRate.from_currency;
        } catch {
            const merchantId = req.user.merchantId;
            const fallbackRate = await getFixedRate(
                req.user.id,
                merchantId,
                fromCurrency,
                toCurrency,
            );
            if (fallbackRate === null) {
                return res.sendError(res.__("189"), 189, 400);
            }
            finalRate = fallbackRate;
            finalFromCurrency = fromCurrency;
        }

        const existingRate = await FxRate.findOne({
            where: {
                fromCurrency: finalFromCurrency,
                toCurrency,
                provider: "em",
            },
        });

        let cachedRate: FxRate;
        if (existingRate) {
            existingRate.rate = String(finalRate);
            cachedRate = await existingRate.save();
        } else {
            cachedRate = await FxRate.create({
                fromCurrency: finalFromCurrency,
                toCurrency,
                provider: "em",
                rate: String(finalRate),
            });
        }

        const countryCodeRow = await MobileCountryCode.findOne({
            where: { alpha3Code: supportedCountry.countryCode },
            attributes: ["alpha2Code"],
        });
        const flag = getFlagUrl(
            countryCodeRow?.alpha2Code,
            process.env.APP_URL || "",
        );

        return res.sendResponse(
            {
                rate: {
                    from_currency: cachedRate.fromCurrency,
                    to_currency: cachedRate.toCurrency,
                    fx_rate: Number(cachedRate.rate).toFixed(4),
                    flag,
                    last_updated: relativeTime(
                        cachedRate.updatedAt ?? new Date(),
                    ),
                },
            },
            "",
            200,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/deposit_wallets — all active platform crypto
 * wallets a user can deposit into.
 */
export const depositWallets = async (
    _req: Request,
    res: Response,
): Promise<void> => {
    try {
        const wallets = await AdminWallet.findAll({
            where: { status: 1 },
            attributes: ["uniqueId", "walletName", "walletAddress", "network"],
        });
        return res.sendResponse(
            {
                wallets: wallets.map((wallet) => ({
                    unique_id: wallet.uniqueId,
                    wallet_name: wallet.walletName,
                    wallet_address: wallet.walletAddress,
                    network: wallet.network,
                })),
            },
            "",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/deposit_lookups?type=source_of_funds|purpose_of_transaction
 */
export const depositLookups = (req: Request, res: Response): void => {
    const { type } = req.query as { type: string };
    const lookupMap =
        type === LOOKUP_TYPE_SOURCE_OF_FUNDS
            ? DEPOSIT_SOURCE_OF_FUNDS
            : DEPOSIT_PURPOSE;

    const lookups = Object.entries(lookupMap).map(([value, label]) => ({
        label,
        value,
    }));

    return res.sendResponse({ lookups }, "", "");
};
