import { setTimeout as wait } from "timers/promises";
import ExternalServiceCall from "../models/external_service_call.model";
import {
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_DEPOSIT_TRANSACTION,
} from "../utils/constants";

/**
 * Provider HTTP client (mirror of the legacy
 * services/external/httpClient.ts, including the corrected
 * external_service_calls audit mapping).
 *
 * One entry per outbound call to an external provider. Wraps fetch
 * with:
 *   - Per-request timeout (AbortController)
 *   - Retry with exponential backoff for transient errors (5xx, network)
 *   - Connection-error -> 0 status mapping
 *   - Audit row in `external_service_calls` for every attempt
 *   - PII-safe logging (auth headers / signatures redacted)
 */

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;

const REDACTED_HEADERS = new Set([
    "authorization",
    "x-api-key",
    "x-api-signature",
    "x-api-secret",
    "cookie",
    "set-cookie",
]);

export interface CallContext {
    /** Provider key ("pu", "ec", ...) used in audit rows and logs. */
    provider: string;
    /** What the call is for ("create", "validate_account", ...). */
    callFor: string;
    /**
     * Optional reference back to the row this call belongs to. The
     * audit table has fixed FK columns per transaction type, so the
     * morph class routes the id into the matching column.
     */
    referenceType?: string;
    referenceId?: number;
}

export interface HttpRequestOptions {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    baseUrl: string;
    path: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
    signRequest?: (signContext: SignContext) => Promise<void> | void;
}

export interface SignContext {
    method: string;
    baseUrl: string;
    path: string;
    bodyJson: string;
    headers: Record<string, string>;
}

export interface HttpResponse<T = unknown> {
    ok: boolean;
    status: number;
    body: T | null;
    raw: string;
    headers: Record<string, string>;
    durationMs: number;
}

const redactHeaders = (
    headers: Record<string, string>,
): Record<string, string> => {
    const redacted: Record<string, string> = {};
    for (const [headerName, headerValue] of Object.entries(headers)) {
        redacted[headerName] = REDACTED_HEADERS.has(headerName.toLowerCase())
            ? "[REDACTED]"
            : headerValue;
    }
    return redacted;
};

const isRetryable = (status: number, error: unknown): boolean => {
    if (error) {
        return true;
    }
    if (status === 0) {
        return true;
    }
    if (status >= 500 && status < 600) {
        return true;
    }
    if (status === 408 || status === 425 || status === 429) {
        return true;
    }
    return false;
};

const buildUrl = (
    baseUrl: string,
    path: string,
    query?: HttpRequestOptions["query"],
): string => {
    const url = new URL(
        path.startsWith("http")
            ? path
            : `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
    );
    if (query) {
        for (const [parameterName, parameterValue] of Object.entries(query)) {
            if (parameterValue === undefined) {
                continue;
            }
            url.searchParams.set(parameterName, String(parameterValue));
        }
    }
    return url.toString();
};

/**
 * Persist the audit row best-effort — an unwritten audit row is
 * preferable to a swallowed provider response.
 */
const persistAudit = async (
    context: CallContext,
    endpoint: string,
    method: string,
    requestHeaders: Record<string, string>,
    body: unknown,
    status: number | null,
    responseRaw: string | null,
    durationMs: number,
    errorMessage: string | null,
): Promise<void> => {
    const requestPayload = {
        headers: redactHeaders(requestHeaders),
        body: body ?? null,
    };

    let responsePayload: unknown = null;
    if (responseRaw) {
        const trimmedResponse = responseRaw.slice(0, 65_535);
        try {
            responsePayload = JSON.parse(trimmedResponse);
        } catch {
            responsePayload = { raw: trimmedResponse };
        }
    }

    try {
        await ExternalServiceCall.create({
            externalType: context.provider,
            action: context.callFor,
            method,
            endpoint,
            beneficiaryTransactionId:
                context.referenceType === MORPH_BENEFICIARY_TRANSACTION
                    ? context.referenceId ?? null
                    : null,
            depositTransactionId:
                context.referenceType === MORPH_DEPOSIT_TRANSACTION
                    ? context.referenceId ?? null
                    : null,
            requestPayload,
            responsePayload,
            httpStatus: status,
            success: status !== null && status >= 200 && status < 300,
            responseTimeMs: Math.round(durationMs),
            errorMessage,
        });
    } catch (auditError) {
        // eslint-disable-next-line no-console
        console.error(
            "external_service_calls audit write failed:",
            auditError,
        );
    }
};

/**
 * Single round-trip — all external provider calls go through this.
 */
export const call = async <T = unknown>(
    context: CallContext,
    options: HttpRequestOptions,
): Promise<HttpResponse<T>> => {
    const url = buildUrl(options.baseUrl, options.path, options.query);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = options.retries ?? DEFAULT_RETRIES;

    const requestHeaders: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
    };
    const bodyJson =
        options.body !== undefined ? JSON.stringify(options.body) : "";

    if (options.signRequest) {
        await options.signRequest({
            method: options.method,
            baseUrl: options.baseUrl,
            path: options.path,
            bodyJson,
            headers: requestHeaders,
        });
    }

    let attempt = 0;
    let lastError: unknown;
    let lastResponse: HttpResponse<T> | null = null;

    while (attempt <= retries) {
        const abortController = new AbortController();
        const abortTimer = setTimeout(
            () => abortController.abort(),
            timeoutMs,
        );
        const attemptStart = Date.now();

        try {
            const fetchResponse = await fetch(url, {
                method: options.method,
                headers: requestHeaders,
                body:
                    options.method === "GET" || !options.body
                        ? undefined
                        : bodyJson,
                signal: abortController.signal,
            });
            const rawBody = await fetchResponse.text();

            let parsedBody: T | null = null;
            try {
                parsedBody = rawBody ? (JSON.parse(rawBody) as T) : null;
            } catch {
                // Provider returned non-JSON — parsed stays null, raw survives.
            }

            const responseHeaders: Record<string, string> = {};
            fetchResponse.headers.forEach((headerValue, headerName) => {
                responseHeaders[headerName] = headerValue;
            });

            const response: HttpResponse<T> = {
                ok: fetchResponse.ok,
                status: fetchResponse.status,
                body: parsedBody,
                raw: rawBody,
                headers: responseHeaders,
                durationMs: Date.now() - attemptStart,
            };

            // Audit before the retry decision so the trail is complete.
            await persistAudit(
                context,
                url,
                options.method,
                requestHeaders,
                options.body,
                fetchResponse.status,
                rawBody,
                response.durationMs,
                null,
            );

            if (fetchResponse.ok || !isRetryable(fetchResponse.status, null)) {
                return response;
            }
            lastResponse = response;
        } catch (fetchError) {
            const durationMs = Date.now() - attemptStart;
            lastError = fetchError;
            const errorMessage =
                fetchError instanceof Error
                    ? fetchError.message
                    : String(fetchError);
            await persistAudit(
                context,
                url,
                options.method,
                requestHeaders,
                options.body,
                0,
                null,
                durationMs,
                errorMessage,
            );
            if (!isRetryable(0, fetchError)) {
                throw fetchError;
            }
        } finally {
            clearTimeout(abortTimer);
        }

        if (attempt < retries) {
            const backoffMs = DEFAULT_BACKOFF_MS * 2 ** attempt;
            await wait(backoffMs);
        }
        attempt += 1;
    }

    if (lastResponse) {
        // eslint-disable-next-line no-console
        console.warn(
            `external service call exhausted retries: ${context.provider}/${context.callFor} status=${lastResponse.status}`,
        );
        return lastResponse;
    }
    throw lastError ?? new Error("external service call failed without response");
};
