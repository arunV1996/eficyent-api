import { Op } from "sequelize";
import Lookup from "../models/lookup.model";
import MobileCountryCode from "../models/mobile_country_code.model";
import State from "../models/state.model";
import { getFlagUrl } from "../utils/common.utils";
import { ACTIVE, B2B, B2C, C2B, C2C, USER_TYPE_BUSINESS } from "../utils/constants";

/**
 * Lookup builders shared across controllers (mirror of the legacy
 * lookupsService + helpers/lookups.ts). Every function returns the
 * exact same shape as the current /node implementation so the frontend
 * is unchanged.
 *
 * Deliberately NOT ported yet (their models belong to later tranches):
 *   - receivingCountries (needs SupportedCountry, Merchant, MerchantSetting)
 *   - rates              (needs FxRate)
 *   - serviceBanks       (needs ServiceBank)
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
