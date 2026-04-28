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
    return sendResponse(res, "", 200, {
      mobile_country_codes: await lookupsService.mobileCountryCodes(),
    });
  },

  async countries(_req: Request, res: Response): Promise<Response> {
    return sendResponse(res, "", 200, {
      countries: await lookupsService.countries(),
    });
  },

  async states(req: Request, res: Response): Promise<Response> {
    const { country_code } = req.query as { country_code?: string };
    return sendResponse(res, "", 200, {
      states: await lookupsService.states(country_code),
    });
  },

  paymentRails(_req: Request, res: Response): Response {
    return sendResponse(res, "", 200, {
      payment_rails: [
        { label: "Wire", value: "wire" },
        { label: "ACH", value: "ach" },
        { label: "Swift", value: "swift" },
      ],
    });
  },

  async banks(req: Request, res: Response): Promise<Response> {
    const { country_code } = req.query as { country_code: string };
    return sendResponse(res, "", 200, {
      banks: await lookupsService.serviceBanks(country_code),
    });
  },

  async receivingCountries(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(401, undefined, 401);
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
    return sendResponse(res, "", 200, {
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
    return sendResponse(res, "", 200, {
      rates: await lookupsService.rates(req.user, search_key),
    });
  },

  async refreshRates(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(401, undefined, 401);
    // The refresh path requires the Massive quote provider to be ported
    // (Phase 8). For Phase 2 we surface a clean 501 rather than a silent
    // failure - clients can fall back to the cached `get-rates` data.
    const _validated = req.body as RefreshRateInput;
    void _validated;
    throw new ApiException(
      501,
      "FX rate refresh is not yet available in the Node port - use cached rates from /lookups/get-rates.",
      501,
    );
  },

  depositLookups(req: Request, res: Response): Response {
    const { type } = req.query as unknown as DepositLookupInput;
    const map = type === LOOKUP_TYPE_SOURCE_OF_FUNDS ? DEPOSIT_SOURCE_OF_FUNDS : DEPOSIT_PURPOSE;
    const lookups = Object.entries(map).map(([value, label]) => ({ label, value }));
    return sendResponse(res, "", 200, { lookups });
  },
};
