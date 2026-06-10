import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";
import { ApiException } from "../../helpers/errors";
import { prisma } from "../../db/prisma";
import {
  EXTERNAL_TYPE_DIGININE,
} from "../../helpers/constants";
import {
  QuoteDriver,
  QuoteDriverPayload,
  QuoteDriverResponse,
} from "./quoteFactory";

/**
 * Mirror of App\\Services\\Diginine\\* services.
 *
 * Auth: open API (transit-only headers); production places this behind
 * IP allowlisting at the gateway. Endpoints sourced from the Diginine
 * secret bundle.
 */

interface DiginineSecret extends Record<string, unknown> {
  URL: string;
  IS_SANDBOX?: boolean;
  GET_QUOTE_ENDPOINT: string;
  CONFIRM_TRANSACTION_ENDPOINT: string;
  CREATE_TRANSACTION_ENDPOINT: string;
  GET_TRANSACTION_STATUS_ENDPOINT: string;
  GET_LOOKUPS_ENDPOINT: string;
  GET_BANKS_ENDPOINT: string;
  GET_RATES_ENDPOINT: string;
  GET_SERVICE_CORRIDOR_ENDPOINT: string;
}

let cachedSecret: DiginineSecret | null = null;
async function loadSecret(): Promise<DiginineSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<DiginineSecret>("diginine");
  return cachedSecret;
}

interface DiginineResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  code: number;
}

async function callJSON<T>(
  method: "GET" | "POST",
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<DiginineResponse<T>> {
  const secret = await loadSecret();
  const res = await call<{ success?: boolean; message?: string; data?: T }>(
    {
      provider: "diginine",
      callFor: ctx.callFor,
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
    },
    {
      method,
      baseUrl: secret.URL,
      path: endpoint,
      body: method === "POST" ? payload : undefined,
      query: method === "GET" ? (payload as Record<string, string | number>) : undefined,
      timeoutMs: 90_000,
    },
  );
  return {
    success: res.body?.success === true,
    message: res.body?.message ?? "",
    data: (res.body?.data ?? null) as T | null,
    code: res.status,
  };
}

// ---------------------------------------------------------------------------
// Lookup ingestion (mirrors Helper::syncDiginineCountries / Lookups / Banks)
// ---------------------------------------------------------------------------

export const DiginineLookups = {
  async getServiceCorridor(payload: Record<string, unknown> = {}): Promise<{
    success: boolean;
    data: unknown;
    message: string;
  }> {
    const r = await callJSON<unknown>(
      "GET",
      (await loadSecret()).GET_SERVICE_CORRIDOR_ENDPOINT,
      payload,
      { callFor: "create" },
    );
    return r;
  },
  async getLookups(payload: Record<string, unknown> = {}): Promise<{
    success: boolean;
    data: unknown;
    message: string;
  }> {
    const r = await callJSON<unknown>(
      "GET",
      (await loadSecret()).GET_LOOKUPS_ENDPOINT,
      payload,
      { callFor: "create" },
    );
    return r;
  },
  async getBanks(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data: unknown;
    message: string;
  }> {
    const r = await callJSON<unknown>(
      "GET",
      (await loadSecret()).GET_BANKS_ENDPOINT,
      payload,
      { callFor: "create" },
    );
    return r;
  },
  async getRates(payload: Record<string, unknown>): Promise<{
    success: boolean;
    data: unknown;
    message: string;
  }> {
    const r = await callJSON<unknown>(
      "GET",
      (await loadSecret()).GET_RATES_ENDPOINT,
      payload,
      { callFor: "quote" },
    );
    return r;
  },
};

/**
 * Mirror of Diginine QuoteService - same QuoteDriver interface as Massive
 * so the QuoteFactory selects between them on external_type.
 */
class DiginineQuoteDriver implements QuoteDriver {
  async create(
    payload: QuoteDriverPayload,
    user: { id: bigint },
  ): Promise<QuoteDriverResponse> {
    const secret = await loadSecret();
    const body = {
      amount: payload.amount,
      receiving_currency: payload.receiving_currency,
      recipient_country: payload.recipient_country,
      recipient_type: payload.recipient_type === 2 ? "BUSINESS" : "INDIVIDUAL",
      side: payload.quote_type,
      payment_rail: payload.payment_rail,
    };
    const res = await callJSON<{
      status?: string;
      fx_rate?: string | number;
      amount?: string | number;
      receiving_amount?: string | number;
      external_reference_id?: string;
      expires_at?: string;
      fee_details?: Array<{ amount: number | string; [k: string]: unknown }>;
    }>(
      "POST",
      secret.GET_QUOTE_ENDPOINT,
      body,
      {
        callFor: "quote",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
    );
    if (!res.success || !res.data) {
      throw new ApiException(189, "Diginine quote rejected.", 502);
    }
    let external_fees = 0;
    if (res.data.fee_details && Array.isArray(res.data.fee_details)) {
      for (const fee of res.data.fee_details) {
        external_fees += Number(fee.amount ?? 0);
      }
    }
    return {
      amount: Number(res.data.amount ?? payload.amount),
      receiving_amount: Number(res.data.receiving_amount ?? 0),
      fx_rate: Number(res.data.fx_rate ?? 0),
      external_fx_rate: Number(res.data.fx_rate ?? 0),
      external_reference_id: res.data.external_reference_id ?? undefined,
      expires_at: res.data.expires_at ?? undefined,
      external_data: res.data as Record<string, unknown>,
      quote_type: payload.quote_type,
      external_commission_amount: external_fees,
    };
  }
}

export const Diginine = new DiginineQuoteDriver();

/**
 * Mirror of Diginine BeneficiaryTransactionService - exported as a
 * separate driver so the BeneficiaryTransaction dispatch chain selects
 * Diginine when external_type is "ed".
 */
export const DiginineTransactions = {
  async create(
    payload: Record<string, unknown>,
    referenceId: bigint,
  ): Promise<DiginineResponse<unknown>> {
    return callJSON<unknown>(
      "POST",
      (await loadSecret()).CREATE_TRANSACTION_ENDPOINT,
      payload,
      {
        callFor: "create",
        referenceType: "App\\Models\\BeneficiaryTransaction",
        referenceId,
      },
    );
  },
  async confirm(
    payload: Record<string, unknown>,
    referenceId: bigint,
  ): Promise<DiginineResponse<unknown>> {
    return callJSON<unknown>(
      "POST",
      (await loadSecret()).CONFIRM_TRANSACTION_ENDPOINT,
      payload,
      {
        callFor: "confirm",
        referenceType: "App\\Models\\BeneficiaryTransaction",
        referenceId,
      },
    );
  },
  async getStatus(
    externalReferenceId: string,
    referenceId: bigint,
  ): Promise<DiginineResponse<unknown>> {
    return callJSON<unknown>(
      "GET",
      (await loadSecret()).GET_TRANSACTION_STATUS_ENDPOINT,
      { external_reference_id: externalReferenceId },
      {
        callFor: "status_check",
        referenceType: "App\\Models\\BeneficiaryTransaction",
        referenceId,
      },
    );
  },
};

void EXTERNAL_TYPE_DIGININE;
void prisma;
void logger;
