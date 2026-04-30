import { setTimeout as wait } from "timers/promises";
import { logger } from "../../helpers/logger";
import { prisma } from "../../db/prisma";

/**
 * Provider HTTP client.
 *
 * One entry per outbound call to an external provider. Wraps fetch with:
 *   - Per-request timeout (AbortController)
 *   - Retry with exponential backoff for transient errors (5xx, network)
 *   - Connection-error -> 0 status mapping
 *   - Audit row in `external_service_calls` for every call (success or fail)
 *   - PII-safe logging (auth headers / signatures redacted)
 *
 * Each provider driver passes its own `signRequest` callback which mutates
 * the headers (HMAC, bearer, etc.) before the request goes out. The
 * signing logic stays close to its provider (every API has its own quirks)
 * but the transport, retry, and auditing live here.
 */

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;
const REDACT_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "x-api-signature",
  "x-api-secret",
  "cookie",
  "set-cookie",
]);

export interface CallContext {
  /**
   * Provider key (matches Laravel MODULE_*: caliza, fvbank, processingunit, ...).
   * Used in audit rows and structured logs.
   */
  provider: string;

  /**
   * What this call is for (matches Laravel EXTERNAL_CALL_FOR_*).
   * Examples: "create", "quote", "status_check", "callback", "confirm".
   */
  callFor: string;

  /**
   * Polymorphic reference back to the row we're calling for (BeneficiaryTransaction,
   * DepositTransaction, BeneficiaryAccount, User, etc.). Optional - some
   * calls (e.g. lookup sync) have no row.
   */
  referenceType?: string;
  referenceId?: bigint;
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
  signRequest?: (ctx: SignContext) => Promise<void> | void;
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

function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = REDACT_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function isRetryable(status: number, error: unknown): boolean {
  if (error) return true; // any thrown error is a retry candidate
  if (status === 0) return true; // connection-level failure
  if (status >= 500 && status < 600) return true; // server errors
  if (status === 408 || status === 425 || status === 429) return true; // throttling
  return false;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: HttpRequestOptions["query"],
): string {
  const url = new URL(
    path.startsWith("http") ? path : `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function persistAudit(
  ctx: CallContext,
  endpoint: string,
  method: string,
  reqHeaders: Record<string, string>,
  body: unknown,
  status: number | null,
  responseRaw: string | null,
  durationMs: number,
  errorMessage: string | null,
): Promise<void> {
  // Persist the audit row best-effort. We never throw from audit; an
  // unwritten audit row is preferable to a swallowed external service
  // response error.
  try {
    await prisma().externalServiceCall.create({
      data: {
        externalType: ctx.provider,
        callFor: ctx.callFor,
        referenceType: ctx.referenceType ?? null,
        referenceId: ctx.referenceId ?? null,
        endpoint: `${method} ${endpoint}`,
        requestHeaders: redactHeaders(reqHeaders) as never,
        requestPayload: (body ?? null) as never,
        responseStatus: status,
        responseBody: responseRaw ? responseRaw.slice(0, 65_535) : null,
        durationMs: Math.round(durationMs),
        errorMessage,
      },
    });
  } catch (err) {
    logger.warn(
      { err, provider: ctx.provider, callFor: ctx.callFor },
      "external_service_calls audit write failed",
    );
  }
}

/**
 * Single round-trip - all external provider calls go through this.
 */
export async function call<T = unknown>(
  ctx: CallContext,
  options: HttpRequestOptions,
): Promise<HttpResponse<T>> {
  const url = buildUrl(options.baseUrl, options.path, options.query);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...options.headers,
  };
  const bodyJson = options.body !== undefined ? JSON.stringify(options.body) : "";

  if (options.signRequest) {
    await options.signRequest({
      method: options.method,
      baseUrl: options.baseUrl,
      path: options.path,
      bodyJson,
      headers,
    });
  }

  let attempt = 0;
  let lastErr: unknown;
  let lastResponse: HttpResponse<T> | null = null;
  const start = Date.now();

  while (attempt <= retries) {
    const ac = new AbortController();
    const timer = globalThis.setTimeout(() => ac.abort(), timeoutMs);
    const attemptStart = Date.now();
    try {
      const res = await fetch(url, {
        method: options.method,
        headers,
        body: options.method === "GET" || !options.body ? undefined : bodyJson,
        signal: ac.signal,
      });
      const raw = await res.text();
      let parsed: T | null = null;
      try {
        parsed = raw ? (JSON.parse(raw) as T) : null;
      } catch {
        // Provider returned non-JSON - leave parsed=null, raw stays.
      }
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      const response: HttpResponse<T> = {
        ok: res.ok,
        status: res.status,
        body: parsed,
        raw,
        headers: respHeaders,
        durationMs: Date.now() - attemptStart,
      };

      // Audit before retry decision so we have a complete trail.
      await persistAudit(
        ctx,
        url,
        options.method,
        headers,
        options.body,
        res.status,
        raw,
        response.durationMs,
        null,
      );

      if (res.ok || !isRetryable(res.status, null)) return response;
      lastResponse = response;
    } catch (err) {
      const durationMs = Date.now() - attemptStart;
      lastErr = err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      await persistAudit(
        ctx,
        url,
        options.method,
        headers,
        options.body,
        0,
        null,
        durationMs,
        errorMsg,
      );
      if (!isRetryable(0, err)) {
        throw err;
      }
    } finally {
      globalThis.clearTimeout(timer);
    }

    if (attempt < retries) {
      const backoff = DEFAULT_BACKOFF_MS * 2 ** attempt;
      await wait(backoff);
    }
    attempt += 1;
  }

  if (lastResponse) {
    logger.warn(
      {
        provider: ctx.provider,
        callFor: ctx.callFor,
        status: lastResponse.status,
        durationMs: Date.now() - start,
      },
      "external service call exhausted retries",
    );
    return lastResponse;
  }
  throw lastErr ?? new Error("external service call failed without response");
}
