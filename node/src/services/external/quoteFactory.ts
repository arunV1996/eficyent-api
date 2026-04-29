import { ApiException } from "../../helpers/errors";
import { logger } from "../../helpers/logger";
import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_DIGININE,
  EXTERNAL_TYPE_MASSIVE,
} from "../../helpers/constants";

/**
 * Mirror of App\\Factories\\Quotes\\QuoteFactory + per-provider quote drivers
 * (Caliza, Diginine, Massive). The actual external HTTP calls land in Phase 8.
 *
 * For Phase 4 we ship a stub driver that throws 501 for any cross-currency
 * pair the caller hasn't already short-circuited (i.e. when source.currency
 * == target.currency, the QuotesController bypasses the driver entirely and
 * returns fx_rate=1; that path is fully functional now).
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

class StubQuoteDriver implements QuoteDriver {
  constructor(private provider: string) {}
  async create(_payload: QuoteDriverPayload, user: { id: bigint }): Promise<QuoteDriverResponse> {
    logger.warn(
      { userId: user.id.toString(), provider: this.provider },
      "Quote driver stub called - external HTTP lands in Phase 8",
    );
    throw new ApiException(
      501,
      `Quote provider ${this.provider} is not yet available in the Node port (Phase 8).`,
      501,
    );
  }
}

export const QuoteFactory = {
  resolve(externalType: string): QuoteDriver {
    switch (externalType) {
      case EXTERNAL_TYPE_CALIZA:
      case EXTERNAL_TYPE_DIGININE:
      case EXTERNAL_TYPE_MASSIVE:
        return new StubQuoteDriver(externalType);
      default:
        throw new ApiException(113);
    }
  },
};
