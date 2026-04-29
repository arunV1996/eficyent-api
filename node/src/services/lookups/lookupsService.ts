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
import { getFlagUrl } from "../../helpers/lookups";
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
  ): Promise<{ label: string; value: string; country_code: string }[]> {
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
      country_code: r.countryAlpha3 ?? "",
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
  ): Promise<
    { country_name: string; country_code: string; currencies: string[] }[]
  > {
    let rows: {
      countryName: string;
      countryCode: string;
      currency: string;
      type: string | null;
    }[] = [];

    if (user.merchantId) {
      // Merchant-scoped country list.
      const merchant = await prisma().merchant.findFirst({
        where: { uniqueId: user.merchantId },
      });
      if (merchant) {
        const setting = await prisma().merchantSetting.findUnique({
          where: { merchantId_key: { merchantId: merchant.id, key: "payout_countries" } },
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

    // Group by country_code; collect distinct currencies.
    const byCountry = new Map<
      string,
      { country_name: string; country_code: string; currencies: Set<string> }
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
        });
      }
    }
    return Array.from(byCountry.values()).map((g) => ({
      country_name: g.country_name,
      country_code: g.country_code,
      currencies: Array.from(g.currencies),
    }));
  },

  /**
   * Mirror of LookupRepository::rates. Returns cached fx_rates for the user's
   * available `from` currencies vs supported countries.
   *
   * Note: per-merchant commission overlay (CommissionsHelper::calculate_rate_commission)
   * lands when the Wallet/Quotes module is converted - it depends on
   * MerchantFee + Quote logic. For Phase 2 this returns the raw rate, which
   * is correct for unmerged users and a safe over-approximation for others.
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
    // Virtual account currencies will be merged in once VirtualAccount is
    // ported (Phase 3). For now defaults to USD only.

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
          last_updated: relativeTime(cached.updatedAt, user.timezone ?? TIMEZONE_DEFAULT),
        });
      }
    }
    return out;
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
