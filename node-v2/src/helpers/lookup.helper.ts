import { Op } from "sequelize";
import FxRate from "../models/fx_rate.model";
import Lookup from "../models/lookup.model";
import MerchantSetting from "../models/merchant_setting.model";
import MobileCountryCode from "../models/mobile_country_code.model";
import ServiceBank from "../models/service_bank.model";
import State from "../models/state.model";
import SupportedCountry from "../models/supported_country.model";
import User from "../models/user.model";
import { getFlagUrl, relativeTime } from "../utils/common.utils";
import {
    ACTIVE,
    B2B,
    B2C,
    C2B,
    C2C,
    EXTERNAL_TYPE_DIGININE,
    PAYMENT_RAILS,
    USER_TYPE_BUSINESS,
} from "../utils/constants";

/**
 * Lookup builders shared across controllers (mirror of the legacy
 * lookupsService + helpers/lookups.ts). Every function returns the
 * exact same shape as the current /node implementation so the frontend
 * is unchanged.
 *
 * Still deferred: refresh-rates (needs the Massive FX provider).
 */

export interface LookupItem {
    label: string;
    value: string;
}

const applicationBaseUrl = (): string => {
    return process.env.APP_URL || "";
};

/**
 * Country dial codes for the mobile-country-code dropdown.
 */
export const mobileCountryCodes = async (): Promise<
    { label: string; value: string; country_name: string; flag: string }[]
> => {
    const countryCodeRows = await MobileCountryCode.findAll({
        where: { status: ACTIVE },
        order: [["country_name", "ASC"]],
    });

    const baseUrl = applicationBaseUrl();
    return countryCodeRows.map((countryCodeRow) => ({
        label: countryCodeRow.alpha2Code,
        value: countryCodeRow.isdCode,
        country_name: countryCodeRow.countryName,
        flag: getFlagUrl(countryCodeRow.alpha2Code, baseUrl),
    }));
};

/**
 * Country list keyed by alpha-3 code for country dropdowns.
 */
export const countries = async (): Promise<
    { label: string; value: string; flag: string }[]
> => {
    const countryCodeRows = await MobileCountryCode.findAll({
        where: { status: ACTIVE },
        order: [["country_name", "ASC"]],
    });

    const baseUrl = applicationBaseUrl();
    return countryCodeRows.map((countryCodeRow) => ({
        label: countryCodeRow.countryName,
        value: countryCodeRow.alpha3Code,
        flag: getFlagUrl(countryCodeRow.alpha2Code, baseUrl),
    }));
};

/**
 * States for a country. Accepts alpha-2 or alpha-3 country codes and
 * resolves alpha-2 to alpha-3 through mobile_country_codes (mirror of
 * Helper::get_states).
 */
export const states = async (
    countryCode?: string | null,
): Promise<{ label: string; value: string; parent_value: string }[]> => {
    let whereClause = {};

    if (countryCode) {
        const countryCodeRow = await MobileCountryCode.findOne({
            where: {
                [Op.or]: [
                    { alpha2Code: countryCode },
                    { alpha3Code: countryCode },
                ],
            },
        });
        const alpha3Code = countryCodeRow?.alpha3Code ?? countryCode;
        whereClause = {
            [Op.or]: [{ countryCode }, { countryAlpha3: alpha3Code }],
        };
    }

    const stateRows = await State.findAll({
        where: whereClause,
        order: [["name", "ASC"]],
    });

    return stateRows.map((stateRow) => ({
        label: stateRow.name,
        value: stateRow.name,
        parent_value: stateRow.countryAlpha3 ?? "",
    }));
};

/**
 * Bank directory for a payout corridor. Mirror of
 * lookupsService.serviceBanks.
 */
export const serviceBanks = async (
    countryCode: string,
    currency?: string,
    externalType: string | null = EXTERNAL_TYPE_DIGININE,
): Promise<LookupItem[]> => {
    const bankRows = await ServiceBank.findAll({
        where: {
            country: countryCode,
            externalType,
            ...(currency
                ? { [Op.or]: [{ currency: null }, { currency }] }
                : {}),
        },
        order: [["bank_name", "ASC"]],
    });

    return bankRows.map((bankRow) => ({
        label: bankRow.bankName,
        value: bankRow.uniqueId,
    }));
};

/**
 * Maps (sender_user_type, recipient_type) to B2B/B2C/C2B/C2C.
 * Mirror of Helper::format_payment_type.
 */
export const formatPaymentType = (
    senderType: number,
    recipientType: number,
): string => {
    const senderIsBusiness = senderType === USER_TYPE_BUSINESS;
    const recipientIsBusiness = recipientType === USER_TYPE_BUSINESS;

    if (senderIsBusiness && recipientIsBusiness) {
        return B2B;
    }
    if (senderIsBusiness && !recipientIsBusiness) {
        return B2C;
    }
    if (!senderIsBusiness && recipientIsBusiness) {
        return C2B;
    }
    return C2C;
};

/**
 * Generic lookup query by type (professions, business_types, id_types,
 * business_verification_types, ...), optionally filtered by
 * external_type.
 */
export const getLookups = async (
    type: string,
    externalType?: string,
): Promise<LookupItem[]> => {
    const lookupRows = await Lookup.findAll({
        where: {
            type,
            status: ACTIVE,
            ...(externalType ? { externalType } : {}),
        },
        order: [["value", "ASC"]],
    });

    return lookupRows.map((lookupRow) => ({
        label: lookupRow.value,
        value: lookupRow.key,
    }));
};

export const professions = (): Promise<LookupItem[]> => {
    return getLookups("professions");
};

export const businessTypes = (): Promise<LookupItem[]> => {
    return getLookups("business_types");
};

export const idTypes = (): Promise<LookupItem[]> => {
    return getLookups("id_types");
};

export const businessVerificationTypes = (): Promise<LookupItem[]> => {
    return getLookups("business_verification_types");
};

/**
 * Resolves a lookup key to its human-readable value, falling back to
 * the key itself when the row doesn't exist. Mirror of
 * lookupsService.findValuebyKey.
 */
export const findValueByKey = async (
    key: string | number | null | undefined,
    type?: string,
): Promise<string> => {
    if (key === null || key === undefined) {
        return "";
    }

    const lookupRow = await Lookup.findOne({
        where: {
            key: String(key),
            ...(type ? { type } : {}),
        },
    });

    return lookupRow ? lookupRow.value : String(key);
};

interface SupportedCountryRow {
    countryName: string;
    countryCode: string;
    currency: string;
    type: string | null;
}

const supportedCountriesForProviders = async (
    providers: string[],
    paymentType: string,
): Promise<SupportedCountryRow[]> => {
    if (providers.length === 0) {
        return [];
    }
    return SupportedCountry.findAll({
        where: {
            status: ACTIVE,
            externalType: { [Op.in]: providers },
            ...(paymentType
                ? { [Op.or]: [{ type: null }, { type: paymentType }] }
                : {}),
        },
        attributes: ["countryName", "countryCode", "currency", "type"],
        order: [["country_name", "ASC"]],
    });
};

/**
 * Countries the user may pay out to, grouped by country code with
 * their distinct currencies. Mirror of Helper::get_receiving_countries
 * / lookupsService.receivingCountries — including the merchant
 * payout_countries scoping and the India INR-only quirk.
 */
export const receivingCountries = async (
    paymentType: string,
    user: User,
): Promise<
    {
        country_name: string;
        country_code: string;
        currencies: string[];
        alpha_2_code: string;
        flag: string;
        payment_rails: { label: string; value: string }[];
    }[]
> => {
    let supportedRows: SupportedCountryRow[] = [];

    const providers: string[] = Array.isArray(user.serviceProviders)
        ? (user.serviceProviders as string[])
        : [];

    if (user.merchantId) {
        // Merchant-scoped country list (payout_countries holds supported
        // country row IDs as a JSON array of strings).
        const payoutCountriesSetting = await MerchantSetting.findOne({
            where: { merchantId: user.merchantId, key: "payout_countries" },
        });

        let supportedIds: string[] = [];
        if (payoutCountriesSetting?.value) {
            try {
                supportedIds = JSON.parse(payoutCountriesSetting.value) as string[];
            } catch {
                supportedIds = [];
            }
        }

        if (Array.isArray(supportedIds) && supportedIds.length > 0) {
            supportedRows = await SupportedCountry.findAll({
                where: {
                    status: ACTIVE,
                    id: { [Op.in]: supportedIds.map((id) => Number(id)) },
                    ...(paymentType
                        ? { [Op.or]: [{ type: null }, { type: paymentType }] }
                        : {}),
                },
                attributes: ["countryName", "countryCode", "currency", "type"],
                order: [["country_name", "ASC"]],
            });
        } else {
            supportedRows = await supportedCountriesForProviders(
                providers,
                paymentType,
            );
            if (supportedRows.length === 0) {
                return [];
            }
        }
    } else {
        supportedRows = await supportedCountriesForProviders(
            providers,
            paymentType,
        );
        if (supportedRows.length === 0) {
            return [];
        }
    }

    const countryCodeRows = await MobileCountryCode.findAll({
        attributes: ["alpha2Code", "alpha3Code"],
    });
    const alpha3ToAlpha2 = new Map(
        countryCodeRows.map((row) => [row.alpha3Code, row.alpha2Code]),
    );

    // Group by country_code; collect distinct currencies.
    const groupedByCountry = new Map<
        string,
        {
            country_name: string;
            country_code: string;
            currencies: Set<string>;
            alpha_2_code: string;
        }
    >();

    for (const supportedRow of supportedRows) {
        const existingGroup = groupedByCountry.get(supportedRow.countryCode);
        if (existingGroup) {
            if (supportedRow.currency) {
                existingGroup.currencies.add(supportedRow.currency);
            }
        } else {
            groupedByCountry.set(supportedRow.countryCode, {
                country_name: supportedRow.countryName,
                country_code: supportedRow.countryCode,
                currencies: supportedRow.currency
                    ? new Set([supportedRow.currency])
                    : new Set(),
                alpha_2_code: (
                    alpha3ToAlpha2.get(supportedRow.countryCode) ?? ""
                ).toUpperCase(),
            });
        }
    }

    const baseUrl = process.env.APP_URL || "";

    return Array.from(groupedByCountry.values()).map((countryGroup) => {
        // Legacy quirk: India only shows INR even when other currencies
        // exist on the supported-countries rows.
        let currencyList = Array.from(countryGroup.currencies);
        if (countryGroup.country_code === "IND") {
            currencyList = currencyList.includes("INR")
                ? ["INR"]
                : currencyList;
        }

        return {
            country_name: countryGroup.country_name,
            country_code: countryGroup.country_code,
            currencies: currencyList,
            alpha_2_code: countryGroup.alpha_2_code,
            flag: getFlagUrl(countryGroup.alpha_2_code, baseUrl),
            payment_rails:
                countryGroup.country_code === "USA" ? PAYMENT_RAILS : [],
        };
    });
};

/**
 * Cached FX rates for the user's available `from` currencies vs the
 * supported countries. Mirror of LookupRepository::rates.
 */
export const rates = async (
    _user: User,
    searchKey?: string,
): Promise<
    {
        from_currency: string;
        to_currency: string;
        fx_rate: string;
        flag: string;
        last_updated: string;
    }[]
> => {
    const upperSearchKey = searchKey?.toUpperCase().trim();

    const supportedRows = await SupportedCountry.findAll({
        where: {
            status: ACTIVE,
            ...(upperSearchKey
                ? {
                      [Op.or]: [
                          { currency: { [Op.substring]: upperSearchKey } },
                          { countryCode: { [Op.substring]: upperSearchKey } },
                          { countryName: { [Op.substring]: upperSearchKey } },
                      ],
                  }
                : {}),
        },
        attributes: ["countryCode", "currency"],
        group: ["country_code", "currency", "country_name"],
    });

    const fromCurrencies = new Set<string>(["USD"]);
    const rateRows: {
        from_currency: string;
        to_currency: string;
        fx_rate: string;
        flag: string;
        last_updated: string;
    }[] = [];

    const baseUrl = process.env.APP_URL || "";

    for (const fromCurrency of fromCurrencies) {
        for (const supportedRow of supportedRows) {
            if (fromCurrency === supportedRow.currency) {
                continue;
            }
            const cachedRate = await FxRate.findOne({
                where: {
                    fromCurrency,
                    toCurrency: supportedRow.currency,
                },
            });
            if (!cachedRate) {
                continue;
            }
            const countryCodeRow = await MobileCountryCode.findOne({
                where: { alpha3Code: supportedRow.countryCode },
                attributes: ["alpha2Code"],
            });
            rateRows.push({
                from_currency: cachedRate.fromCurrency,
                to_currency: supportedRow.currency,
                fx_rate: Number(cachedRate.rate).toFixed(4),
                flag: getFlagUrl(countryCodeRow?.alpha2Code, baseUrl),
                last_updated: relativeTime(cachedRate.updatedAt ?? new Date()),
            });
        }
    }

    return rateRows;
};

/**
 * Resolves a state code to its full name for the given country,
 * returning the raw code when no match exists. Mirror of
 * helpers/lookups.getStateName.
 */
export const getStateName = async (
    stateCode: string | null | undefined,
    countryCode: string | null | undefined,
): Promise<string> => {
    if (!stateCode) {
        return "";
    }

    const trimmedStateCode = stateCode.trim();
    if (trimmedStateCode.length > 3) {
        return trimmedStateCode;
    }

    try {
        const countryCodeRow = countryCode
            ? await MobileCountryCode.findOne({
                  where: {
                      [Op.or]: [
                          { alpha2Code: countryCode },
                          { alpha3Code: countryCode },
                      ],
                  },
              })
            : null;
        const alpha3Code = countryCodeRow?.alpha3Code ?? countryCode;

        const stateRow = await State.findOne({
            where: {
                stateCode: {
                    [Op.in]: [
                        trimmedStateCode,
                        trimmedStateCode.toUpperCase(),
                        trimmedStateCode.toLowerCase(),
                    ],
                },
                ...(alpha3Code ? { countryAlpha3: alpha3Code } : {}),
            },
        });

        return stateRow?.name ?? trimmedStateCode;
    } catch {
        return trimmedStateCode;
    }
};
