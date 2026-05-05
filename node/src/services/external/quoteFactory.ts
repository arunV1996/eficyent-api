import { ApiException } from "../../helpers/errors";
import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_DIGININE,
  EXTERNAL_TYPE_MASSIVE,
} from "../../helpers/constants";

/**
 * Mirror of App\\Factories\\Quotes\\QuoteFactory.
 *
 * Phase 8a: Massive + Diginine drivers wired up. The Caliza quote
 * provider is rare in production - Caliza is primarily a virtual account
 * provider. When external_type == EXTERNAL_TYPE_CALIZA the QuotesController
 * short-circuits same-currency quotes; the driver is registered as an
 * alias of Massive so cross-currency falls back gracefully.
 */

export interface QuoteDriverPayload {
  amount: number;
  receiving_currency: string;
  recipient_country: string;
  recipient_type: number;
  quote_type: string;
  payment_rail?: string | null;
  source_id: bigint;
  virtual_account_id?: bigint;
}

export interface QuoteDriverResponse {
  amount: number;
  receiving_amount: number;
  fx_rate: number;
  external_fx_rate: number;
  external_reference_id?: string;
  expires_at?: string;
  external_data?: Record<string, unknown>;
  quote_type: string;
}

export interface QuoteDriver {
  create(
    payload: QuoteDriverPayload,
    user: { id: bigint },
  ): Promise<QuoteDriverResponse>;
}

export const QuoteFactory = {
  resolve(externalType: string): QuoteDriver {
    // Lazy require to avoid the import cycle: massive.ts and diginine.ts
    // both import this file (for the QuoteDriver interface).
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { Massive } = require("./massive") as typeof import("./massive");
    const { Diginine } = require("./diginine") as typeof import("./diginine");
    /* eslint-enable @typescript-eslint/no-require-imports */

    switch (externalType) {
      case EXTERNAL_TYPE_MASSIVE:
      case EXTERNAL_TYPE_CALIZA:
        // Caliza alias - Caliza accounts route their cross-currency quotes
        // through Massive in production.
        return Massive;
      case EXTERNAL_TYPE_DIGININE:
        return Diginine;
      default:
        throw new ApiException(113);
    }
  },
};
