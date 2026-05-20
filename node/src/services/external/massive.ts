import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";
import { ApiException } from "../../helpers/errors";
import {
  QuoteDriver,
  QuoteDriverPayload,
  QuoteDriverResponse,
} from "./quoteFactory";

/**
 * Mirror of App\\Services\\Massive\\Massive + QuoteService.
 *
 * Auth: x-api-key header, no signing.
 * Endpoints from secret bundle:
 *   POST /quote          - create a forward/reverse quote
 *
 * Massive's response envelope:
 *   {
 *     "success": true,
 *     "data": {
 *       "data": {
 *         "status": "success",
 *         "fx_rate": "...",
 *         "amount": ...,
 *         "receiving_amount": ...,
 *         "external_reference_id": "...",
 *         "expires_at": "..."
 *       }
 *     }
 *   }
 */

interface MassiveSecret extends Record<string, unknown> {
  URL: string;
  API_KEY: string;
  IS_SANDBOX?: boolean;
  GET_QUOTE_ENDPOINT: string;
}

let cachedSecret: MassiveSecret | null = null;
async function loadSecret(): Promise<MassiveSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<MassiveSecret>("massive");
  return cachedSecret;
}

class MassiveQuoteDriver implements QuoteDriver {
  async create(
    payload: QuoteDriverPayload,
    user: { id: bigint },
  ): Promise<QuoteDriverResponse> {
    const secret = await loadSecret();
    const body = {
      amount: payload.amount,
      from_currency: payload.from_currency,
      to_currency: payload.receiving_currency,
      to_country: payload.recipient_country,
      recipient_type: payload.recipient_type === 2 ? "BUSINESS" : "INDIVIDUAL",
      side: payload.quote_type,
      payment_rail: payload.payment_rail,
    };
    const res = await call<{
      success?: boolean;
      data?: {
        data?: {
          status?: string;
          fx_rate?: number | string;
          amount?: number | string;
          receiving_amount?: number | string;
          external_reference_id?: string;
          expires_at?: string;
          [k: string]: unknown;
        };
      };
    }>(
      {
        provider: "massive",
        callFor: "quote",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
      {
        method: "POST",
        baseUrl: secret.URL,
        path: secret.GET_QUOTE_ENDPOINT,
        body,
        headers: { "x-api-key": secret.API_KEY },
        timeoutMs: 30_000,
      },
    );

    const ok = res.body?.success === true;
    const inner = res.body?.data?.data;
    if (!ok || !inner || inner.status !== "success") {
      logger.warn(
        { status: res.status, response: res.body },
        "Massive quote create rejected",
      );
      throw new ApiException(
        189,
        "FX rate not available from quote provider.",
        502,
      );
    }

    // Mirror Laravel: prefer inner.last.bid, fallback to inner.fx_rate.
    const last = inner["last"] as { bid?: number | string } | undefined;
    const rate = last?.bid ?? inner.fx_rate ?? 0;

    return {
      amount: Number(inner.amount ?? payload.amount),
      receiving_amount: Number(inner.receiving_amount ?? 0),
      fx_rate: Number(rate),
      external_fx_rate: Number(rate),
      external_reference_id: inner.external_reference_id ?? undefined,
      expires_at: inner.expires_at ?? undefined,
      external_data: inner as Record<string, unknown>,
      quote_type: payload.quote_type,
    };
  }

  async rate(payload: {
    amount: number;
    from_currency: string;
    to_currency: string;
  }): Promise<{
    success: boolean;
    fx_rate: number | null;
    from_currency: string;
    raw: unknown;
  }> {
    const secret = await loadSecret();
    const res = await call<{
      success?: boolean;
      data?: {
        data?: {
          fx_rate?: number | string;
          last?: { bid?: number | string };
        };
      };
    }>(
      { provider: "massive", callFor: "quote" },
      {
        method: "POST",
        baseUrl: secret.URL,
        path: secret.GET_QUOTE_ENDPOINT,
        body: {
          amount: payload.amount,
          from_currency: payload.from_currency,
          to_currency: payload.to_currency,
        },
        headers: { "x-api-key": secret.API_KEY },
        timeoutMs: 15_000,
      },
    );
    const inner = res.body?.data?.data;
    const last = inner?.last;
    const rate = last?.bid ?? inner?.fx_rate;

    return {
      success: res.body?.success === true && (rate !== undefined && rate !== null),
      fx_rate: rate ? Number(rate) : null,
      from_currency: payload.from_currency,
      raw: inner,
    };
  }
}

export const Massive = new MassiveQuoteDriver();
