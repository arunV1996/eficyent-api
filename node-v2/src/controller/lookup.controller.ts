import { Request, Response } from "express";
import {
    countries as buildCountries,
    formatPaymentType,
    mobileCountryCodes as buildMobileCountryCodes,
    rates as buildRates,
    receivingCountries as buildReceivingCountries,
    serviceBanks,
    states as buildStates,
} from "../helpers/lookup.helper";
import { settingGet } from "../helpers/setting.helper";
import {
    DEPOSIT_PURPOSE,
    DEPOSIT_SOURCE_OF_FUNDS,
    LOOKUP_TYPE_SOURCE_OF_FUNDS,
    PAYMENT_RAILS,
    USER_TYPE_MAP,
} from "../utils/constants";

/**
 * Mirror of the legacy Api\LookupsController public endpoints.
 *
 * The legacy controller responds with sendResponse(res, "", "", data),
 * which serializes to {status: true, code: "", message: "OK", data} —
 * we call res.sendResponse(data, "OK", "") to keep that envelope
 * byte-identical.
 *
 * Endpoints deferred to later tranches (models/providers not yet
 * ported): banks (ServiceBank), deposit_wallets (AdminWallet),
 * receiving_countries / get-rates / refresh-rates (SupportedCountry,
 * FxRate, Massive provider).
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
            "OK",
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
        return res.sendResponse({ countries: await buildCountries() }, "OK", "");
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
            "OK",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/payment_rails
 */
export const paymentRails = (_req: Request, res: Response): void => {
    return res.sendResponse({ payment_rails: PAYMENT_RAILS }, "OK", "");
};

/**
 * GET /api/user/lookups/banks?country_code=IND&currency=INR
 */
export const banks = async (req: Request, res: Response): Promise<void> => {
    try {
        const { country_code: countryCode } = req.query as {
            country_code: string;
        };
        return res.sendResponse(
            { banks: await serviceBanks(countryCode) },
            "OK",
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
            "OK",
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/lookups/get-rates?search_key=...
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
            "OK",
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

    return res.sendResponse({ lookups }, "OK", "");
};
