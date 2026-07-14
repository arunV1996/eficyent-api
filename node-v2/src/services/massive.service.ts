import { CodedError } from "../helpers/coded_error.helper";
import { call } from "./http_client.service";
import { MORPH_USER, USER_TYPE_BUSINESS } from "../utils/constants";

/**
 * Massive FX quote provider (mirror of the legacy
 * services/external/massive.ts). Auth is a plain x-api-key header —
 * no request signing.
 *
 * Configuration comes from the environment:
 *   MASSIVE_URL                 base URL
 *   MASSIVE_API_KEY             api key header value
 *   MASSIVE_GET_QUOTE_ENDPOINT  quote path (e.g. "quote")
 */

interface MassiveConfig {
    baseUrl: string;
    apiKey: string;
    quoteEndpoint: string;
}

const loadConfig = (): MassiveConfig => {
    const baseUrl = process.env.MASSIVE_URL;
    const apiKey = process.env.MASSIVE_API_KEY;
    const quoteEndpoint = process.env.MASSIVE_GET_QUOTE_ENDPOINT;
    if (!baseUrl || !apiKey || !quoteEndpoint) {
        throw new Error(
            "Massive is not configured (MASSIVE_URL / _API_KEY / _GET_QUOTE_ENDPOINT)",
        );
    }
    return { baseUrl, apiKey, quoteEndpoint };
};

export interface QuoteDriverPayload {
    amount: number;
    from_currency: string;
    receiving_currency: string;
    recipient_country: string;
    recipient_type: number;
    quote_type: string;
    payment_rail?: string | null;
}

export interface QuoteDriverResponse {
    amount: number;
    receiving_amount: number;
    fx_rate: number;
    external_fx_rate: number;
    quote_type: string;
    external_reference_id?: string;
    expires_at?: string;
    external_data?: Record<string, unknown>;
    external_commission_amount?: number;
}

interface MassiveInnerData {
    status?: string;
    fx_rate?: number | string;
    amount?: number | string;
    receiving_amount?: number | string;
    external_reference_id?: string;
    expires_at?: string;
    last?: { bid?: number | string };
    [key: string]: unknown;
}

interface MassiveEnvelope {
    success?: boolean;
    data?: { data?: MassiveInnerData };
}

/**
 * Creates a forward/reverse quote. Mirrors the legacy driver,
 * including the last.bid-over-fx_rate rate preference.
 */
export const createQuote = async (
    payload: QuoteDriverPayload,
    user: { id: number },
): Promise<QuoteDriverResponse> => {
    const config = loadConfig();
    const requestBody = {
        amount: payload.amount,
        from_currency: payload.from_currency,
        to_currency: payload.receiving_currency,
        to_country: payload.recipient_country,
        recipient_type:
            payload.recipient_type === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "INDIVIDUAL",
        side: payload.quote_type,
        payment_rail: payload.payment_rail,
    };

    const response = await call<MassiveEnvelope>(
        {
            provider: "massive",
            callFor: "quote",
            referenceType: MORPH_USER,
            referenceId: user.id,
        },
        {
            method: "POST",
            baseUrl: config.baseUrl,
            path: config.quoteEndpoint,
            body: requestBody,
            headers: { "x-api-key": config.apiKey },
            timeoutMs: 30_000,
        },
    );

    const isSuccess = response.body?.success === true;
    const innerData = response.body?.data?.data;
    if (!isSuccess || !innerData || innerData.status !== "success") {
        // eslint-disable-next-line no-console
        console.warn(
            `Massive quote create rejected (status=${response.status})`,
        );
        throw new CodedError(
            "FX rate not available from quote provider.",
            189,
            502,
        );
    }

    // Mirror Laravel: prefer inner.last.bid, fall back to inner.fx_rate.
    const rate = innerData.last?.bid ?? innerData.fx_rate ?? 0;

    return {
        amount: Number(innerData.amount ?? payload.amount),
        receiving_amount: Number(innerData.receiving_amount ?? 0),
        fx_rate: Number(rate),
        external_fx_rate: Number(rate),
        external_reference_id: innerData.external_reference_id ?? undefined,
        expires_at: innerData.expires_at ?? undefined,
        external_data: innerData as Record<string, unknown>,
        quote_type: payload.quote_type,
        external_commission_amount: 0,
    };
};

/**
 * Lightweight rate check (used by refresh-rates and the FX cron).
 */
export const getRate = async (payload: {
    amount: number;
    from_currency: string;
    to_currency: string;
}): Promise<{
    success: boolean;
    fx_rate: number | null;
    from_currency: string;
    raw: unknown;
}> => {
    const config = loadConfig();
    const response = await call<MassiveEnvelope>(
        { provider: "massive", callFor: "quote" },
        {
            method: "POST",
            baseUrl: config.baseUrl,
            path: config.quoteEndpoint,
            body: {
                amount: payload.amount,
                from_currency: payload.from_currency,
                to_currency: payload.to_currency,
            },
            headers: { "x-api-key": config.apiKey },
            timeoutMs: 15_000,
        },
    );

    const innerData = response.body?.data?.data;
    const rate = innerData?.last?.bid ?? innerData?.fx_rate;

    return {
        success:
            response.body?.success === true &&
            rate !== undefined &&
            rate !== null,
        fx_rate: rate ? Number(rate) : null,
        from_currency: payload.from_currency,
        raw: innerData,
    };
};
