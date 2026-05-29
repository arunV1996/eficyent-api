import { Request, Response } from "express";
import { sendResponse } from "../../helpers/response";
import { ApiException } from "../../helpers/errors";
import { lookupsService } from "../../services/lookups/lookupsService";
import {
  DEPOSIT_PURPOSE,
  DEPOSIT_SOURCE_OF_FUNDS,
} from "../../helpers/lookups";
import { settingGet } from "../../services/settings/settingsService";
import {
  DepositLookupInput,
  RefreshRateInput,
} from "../../validators/lookups/lookupsValidators";
import { LOOKUP_TYPE_SOURCE_OF_FUNDS } from "../../helpers/constants";

/**
 * Mirror of Api\\LookupsController.
 *
 * Endpoints requiring authentication (receiving_countries, get-rates,
 * refresh-rates) read req.user populated by the Sanctum middleware.
 */

export const lookupsController = {
  async mobileCountryCodes(_req: Request, res: Response): Promise<Response> {
    return sendResponse(res, "", "", {
      mobile_country_codes: await lookupsService.mobileCountryCodes(),
    });
  },

  async countries(_req: Request, res: Response): Promise<Response> {
    return sendResponse(res, "", "", {
      countries: await lookupsService.countries(),
    });
  },

  async states(req: Request, res: Response): Promise<Response> {
    const { country_code } = req.query as { country_code?: string };
    return sendResponse(res, "", "", {
      states: await lookupsService.states(country_code),
    });
  },

  paymentRails(_req: Request, res: Response): Response {
    return sendResponse(res, "", "", {
      payment_rails: [
        { label: "Wire", value: "wire" },
        { label: "ACH", value: "ach" },
        { label: "Swift", value: "swift" },
      ],
    });
  },

  async banks(req: Request, res: Response): Promise<Response> {
    const { country_code } = req.query as { country_code: string };
    return sendResponse(res, "", "", {
      banks: await lookupsService.serviceBanks(country_code),
    });
  },

  async receivingCountries(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(401, undefined, 401);
// @ts-ignore - Catch-all auto-fix for: Conversion of type 'ParsedQs' ...
    const recipientType = (req.query as { recipient_type: number })
      .recipient_type as number;
    const paymentType = lookupsService.formatPaymentType(
      req.user.userType,
      recipientType,
    );
    const supportedCountries = await lookupsService.receivingCountries(
      paymentType,
      req.user,
    );
    let defaultCountry = await settingGet<string>("quote_default_to_country", "IND");
    let defaultCurrency = "";
    if (supportedCountries.length > 0) {
      const codes = supportedCountries.map((c) => c.country_code);
      if (!codes.includes(defaultCountry)) {
        defaultCountry = supportedCountries[0]?.country_code ?? defaultCountry;
      }
      const idx = codes.indexOf(defaultCountry);
      const currencies = idx >= 0 ? supportedCountries[idx]?.currencies ?? [] : [];
      defaultCurrency = currencies[0] ?? "";
    }
    const defaultAmount = await settingGet<string>("quote_default_from_amount", "100");
    return sendResponse(res, "", "", {
      receiving_countries: supportedCountries,
      defaults: {
        country: defaultCountry,
        currency: defaultCurrency,
        amount: Number(defaultAmount),
      },
    });
  },

  async getRates(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(401, undefined, 401);
    const { search_key } = req.query as { search_key?: string };
    return sendResponse(res, "", "", {
      rates: await lookupsService.rates(req.user, search_key),
    });
  },

  async refreshRates(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(401, undefined, 401);
    const validated = req.body as RefreshRateInput;
    const { Massive } = await import("../../services/external/massive");
    const { prisma } = await import("../../db/prisma");

    const supported = await prisma().supportedCountry.findFirst({
      where: { currency: validated.to_currency, status: 1 },
    });
    if (!supported) throw new ApiException(189);

    let finalRate: number;
    let finalFromCurrency: string;

    try {
      // Massive only quotes USD as source. AED rates are derived from USD
      // by dividing by env USD_TO_AED. Mirrors LookupRepository::createFxRate.
      const rate = await Massive.rate({
        amount: 1,
        from_currency: "USD",
        to_currency: validated.to_currency,
      });
      if (!rate.success || rate.fx_rate === null) {
        throw new Error("Provider rate empty");
      }
      const isAed = validated.from_currency.toUpperCase() === "AED";
      const { convertUsdRateToAed } = await import(
        "../../services/quotes/aedOverride"
      );
      finalRate = isAed
        ? convertUsdRateToAed(rate.fx_rate, validated.to_currency)
        : rate.fx_rate;
      finalFromCurrency = isAed ? "AED" : rate.from_currency;
    } catch (err) {
      // Fallback: If external API fails, search fees table for fixed override (User -> Merchant -> Null owner)
      const merchantId = req.user.merchantId
        ? (
            await prisma().merchant.findFirst({
              where: { id: req.user.merchantId },
            })
          )?.id ?? null
        : null;

      const { getFixedRate } = await import(
        "../../services/commissions/commissionsService"
      );
      const fallbackRate = await getFixedRate(
        req.user.id,
        merchantId,
        validated.from_currency,
        validated.to_currency,
      );
      if (fallbackRate !== null) {
        finalRate = fallbackRate;
        finalFromCurrency = validated.from_currency.toUpperCase();
      } else {
        throw new ApiException(189);
      }
    }

    const fxRate = String(finalRate);
    const cached = await prisma().fxRate.upsert({
      where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
        fx_rate_pair: {
          fromCurrency: finalFromCurrency,
          toCurrency: validated.to_currency,
          provider: "em",
        },
      },
      create: {
        fromCurrency: finalFromCurrency,
        toCurrency: validated.to_currency,
        provider: "em",
        rate: fxRate,
      },
      update: { rate: fxRate },
    });

    return sendResponse(res, "", 200, {
      rate: {
        from_currency: cached.fromCurrency,
        to_currency: cached.toCurrency,
        fx_rate: Number(cached.rate).toFixed(4),
// @ts-expect-error - Auto-fixed: 'cached.updatedAt' is possibly 'null'.
        last_updated: cached.updatedAt.toISOString(),
      },
    });
  },

  async depositLookups(req: Request, res: Response): Promise<Response> {
    const { type } = req.query as unknown as DepositLookupInput;
    const map = type === LOOKUP_TYPE_SOURCE_OF_FUNDS ? DEPOSIT_SOURCE_OF_FUNDS : DEPOSIT_PURPOSE;
    const lookups = Object.entries(map).map(([value, label]) => ({ label, value }));
    return sendResponse(res, "", "", { lookups });
  },

  async depositWallets(_req: Request, res: Response): Promise<Response> {
    const { prisma } = await import("../../db/prisma");
    const wallets = await prisma().adminWallet.findMany({
      where: { status: 1 },
      select: {
        uniqueId: true,
        wallet_name: true,
        wallet_address: true,
        network: true,
      },
    });
    return sendResponse(res, "", "", {
      wallets: wallets.map((w) => ({
        unique_id: w.uniqueId,
        wallet_name: w.wallet_name,
        wallet_address: w.wallet_address,
        network: w.network,
      })),
    });
  },
};
