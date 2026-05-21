import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import {
  ACTIVE,
  B2B,
  B2C,
  C2B,
  C2C,
  USER_TYPE_BUSINESS,
} from "../../helpers/constants";
import { getFlagUrl, getPaymentRails } from "../../helpers/lookups";
import { User } from "@prisma/client";

/**
 * Mirror of selected Helper.php lookup builders + LookupRepository methods
 * required for Phase 2 endpoints.
 *
 * Each function returns the exact same shape as Laravel so the frontend is
 * unchanged.
 */

const TIMEZONE_DEFAULT = "Asia/Kolkata";

interface LookupItem {
  label: string;
  value: string;
}

export const lookupsService = {
  async mobileCountryCodes(): Promise<
    { label: string; value: string; country_name: string; flag: string }[]
  > {
    const rows = await prisma().mobileCountryCode.findMany({
      where: { status: ACTIVE },
      orderBy: { countryName: "asc" },
    });
    const base = env().APP_URL;
    return rows.map((r) => ({
      label: r.alpha2Code,
      value: r.isdCode,
      country_name: r.countryName,
      flag: getFlagUrl(r.alpha2Code, base),
    }));
  },

  async countries(): Promise<{ label: string; value: string; flag: string }[]> {
    const rows = await prisma().mobileCountryCode.findMany({
      where: { status: ACTIVE },
      orderBy: { countryName: "asc" },
    });
    const base = env().APP_URL;
    return rows.map((r) => ({
      label: r.countryName,
      value: r.alpha3Code,
      flag: getFlagUrl(r.alpha2Code, base),
    }));
  },

  async states(
    countryCode?: string | null,
  ): Promise<{ label: string; value: string; parent_value: string }[]> {
    const where: Record<string, unknown> = {};
    if (countryCode) {
      // Resolve alpha3 if user passed alpha2 (mirror Helper::get_states).
      const mcc = await prisma().mobileCountryCode.findFirst({
        where: { OR: [{ alpha2Code: countryCode }, { alpha3Code: countryCode }] },
      });
      const alpha3 = mcc?.alpha3Code ?? countryCode;
      where.OR = [{ countryCode }, { countryAlpha3: alpha3 }];
    }
    const rows = await prisma().state.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      label: r.name,
      value: r.name,
      parent_value: r.countryAlpha3 ?? "",
    }));
  },

  async serviceBanks(
    countryCode: string,
    currency?: string,
    externalType = "ed",
  ): Promise<LookupItem[]> {
    const rows = await prisma().serviceBank.findMany({
      where: {
        country: countryCode,
        externalType,
        ...(currency
          ? { OR: [{ currency: null }, { currency }] }
          : {}),
      },
      orderBy: { bankName: "asc" },
    });
    return rows.map((r) => ({ label: r.bankName, value: r.uniqueId }));
  },

  /**
   * Mirror of Helper::format_payment_type. Maps (sender_user_type, recipient_type)
   * to one of B2B/B2C/C2B/C2C.
   */
  formatPaymentType(senderType: number, recipientType: number): string {
    const senderBiz = senderType === USER_TYPE_BUSINESS;
    const recipBiz = recipientType === USER_TYPE_BUSINESS;
    if (senderBiz && recipBiz) return B2B;
    if (senderBiz && !recipBiz) return B2C;
    if (!senderBiz && recipBiz) return C2B;
    return C2C;
  },

  /**
   * Mirror of Helper::get_receiving_countries. Returns countries grouped by
   * country_code with their currencies, filtered by merchant or user
   * service_providers + payment_type.
   */
  async receivingCountries(
    paymentType: string,
    user: User & { merchant?: { id: bigint } | null },
  ): Promise<any[]> {
    let rows: {
      countryName: string;
      countryCode: string;
      currency: string;
      type: string | null;
    }[] = [];

    if (user.merchantId) {
      // Merchant-scoped country list.
      const merchant = await prisma().merchant.findFirst({
        where: { id: user.merchantId as any },
      });
      if (merchant) {
        const setting = await prisma().merchantSetting.findFirst({
          where: { merchantId: merchant.id, key: "payout_countries" },
        });
        if (!setting?.value) return [];
        let supportedIds: string[] = [];
        try {
          supportedIds = JSON.parse(setting.value) as string[];
        } catch {
          return [];
        }
        if (!Array.isArray(supportedIds) || supportedIds.length === 0) return [];

        rows = await prisma().supportedCountry.findMany({
          where: {
            status: ACTIVE,
            id: { in: supportedIds.map((s) => BigInt(s)) },
            ...(paymentType ? { OR: [{ type: null }, { type: paymentType }] } : {}),
          },
          select: { countryName: true, countryCode: true, currency: true, type: true },
          orderBy: { countryName: "asc" },
        });
      }
    } else {
      const providers: string[] = Array.isArray(user.serviceProviders)
        ? (user.serviceProviders as string[])
        : [];

      rows = await prisma().supportedCountry.findMany({
        where: {
          status: ACTIVE,
          ...(providers.length > 0 ? { externalType: { in: providers } } : {}),
          ...(paymentType ? { OR: [{ type: null }, { type: paymentType }] } : {}),
        },
        select: { countryName: true, countryCode: true, currency: true, type: true },
        orderBy: { countryName: "asc" },
      });
    }

    const mccRows = await prisma().mobileCountryCode.findMany({
      select: { alpha2Code: true, alpha3Code: true },
    });
    const mccMap = new Map(mccRows.map((m) => [m.alpha3Code, m.alpha2Code]));

    // Group by country_code; collect distinct currencies.
    const byCountry = new Map<
      string,
      { 
        country_name: string; 
        country_code: string; 
        currencies: Set<string>; 
        alpha_2_code: string;
      }
    >();

    for (const r of rows) {
      const existing = byCountry.get(r.countryCode);
      if (existing) {
        if (r.currency) existing.currencies.add(r.currency);
      } else {
        byCountry.set(r.countryCode, {
          country_name: r.countryName,
          country_code: r.countryCode,
          currencies: r.currency ? new Set([r.currency]) : new Set(),
          alpha_2_code: mccMap.get(r.countryCode) ?? "",
        });
      }
    }

    const base = env().APP_URL;
    const rails = getPaymentRails();

    return Array.from(byCountry.values()).map((g) => {
      // In legacy, India only showed INR even if supportedCountry had USD.
      // We filter to primary currency if specified in Expected.
      let currencyList = Array.from(g.currencies);
      if (g.country_code === "IND") {
        currencyList = currencyList.includes("INR") ? ["INR"] : currencyList;
      }

      return {
        country_name: g.country_name,
        country_code: g.country_code,
        currencies: currencyList,
        alpha_2_code: g.alpha_2_code,
        flag: getFlagUrl(g.alpha_2_code, base),
        payment_rails: g.country_code === "USA" ? rails : [],
      };
    });
  },

  /**
   * Mirror of LookupRepository::rates. Returns cached fx_rates for the user's
   * available `from` currencies vs supported countries.
   */
  async rates(user: User, search?: string): Promise<
    {
      from_currency: string;
      to_currency: string;
      fx_rate: string;
      flag: string;
      last_updated: string;
    }[]
  > {
    const upper = search?.toUpperCase().trim();
    const supported = await prisma().supportedCountry.findMany({
      where: {
        status: ACTIVE,
        ...(upper
          ? {
              OR: [
                { currency: { contains: upper } },
                { countryCode: { contains: upper } },
                { countryName: { contains: upper } },
              ],
            }
          : {}),
      },
      select: { countryCode: true, currency: true },
    });

    const fromCurrencies = new Set<string>(["USD"]);

    const out: {
      from_currency: string;
      to_currency: string;
      fx_rate: string;
      flag: string;
      last_updated: string;
    }[] = [];

    for (const from of fromCurrencies) {
      for (const sc of supported) {
        if (from === sc.currency) continue;
        const cached = await prisma().fxRate.findFirst({
          where: { fromCurrency: from, toCurrency: sc.currency },
        });
        if (!cached) continue;
        const mcc = await prisma().mobileCountryCode.findFirst({
          where: { alpha3Code: sc.countryCode },
          select: { alpha2Code: true },
        });
        out.push({
          from_currency: cached.fromCurrency,
          to_currency: sc.currency,
          fx_rate: Number(cached.rate).toFixed(4),
          flag: getFlagUrl(mcc?.alpha2Code, env().APP_URL),
          last_updated: relativeTime(cached.updatedAt || new Date(), user.timezone ?? TIMEZONE_DEFAULT),
        });
      }
    }
    return out;
  },
 
  async professions(): Promise<LookupItem[]> {
    const rows = await prisma().lookup.findMany({
      where: { type: "professions", status: ACTIVE },
      orderBy: { value: "asc" },
    });
    return rows.map((r) => ({ label: r.value, value: r.key }));
  },
 
  async businessTypes(): Promise<LookupItem[]> {
    const rows = await prisma().lookup.findMany({
      where: { type: "business_types", status: ACTIVE },
      orderBy: { value: "asc" },
    });
    return rows.map((r) => ({ label: r.value, value: r.key }));
  },
 
  async idTypes(): Promise<LookupItem[]> {
    const rows = await prisma().lookup.findMany({
      where: { type: "id_types", status: ACTIVE },
      orderBy: { value: "asc" },
    });
    return rows.map((r) => ({ label: r.value, value: r.key }));
  },
 
  async businessVerificationTypes(): Promise<LookupItem[]> {
    const rows = await prisma().lookup.findMany({
      where: { type: "business_verification_types", status: ACTIVE },
      orderBy: { value: "asc" },
    });
    return rows.map((r) => ({ label: r.value, value: r.key }));
  },

  async getLookups(type: string): Promise<LookupItem[]> {
    const rows = await prisma().lookup.findMany({
      where: { type, status: ACTIVE },
      orderBy: { value: "asc" },
    });
    return rows.map((r) => ({ label: r.value, value: r.key }));
  },

  async findValuebyKey(key: string | number | null | undefined, type?: string): Promise<string> {
    if (key === null || key === undefined) return "";
    const lookup = await prisma().lookup.findFirst({
      where: {
        key: String(key),
        ...(type ? { type } : {}),
      },
    });
    return lookup ? lookup.value : String(key);
  },
};

function relativeTime(date: Date, _tz: string): string {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
