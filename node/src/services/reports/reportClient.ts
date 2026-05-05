import { call, HttpRequestOptions } from "../external/httpClient";
import { Secrets } from "../../config/secrets";
import {
  EXTERNAL_TYPE_REPORT_SERVER,
} from "../../helpers/constants";

/**
 * Mirror of App\\Services\\Report\\Report (the abstract base).
 *
 * The Reports microservice (`api/debit_transactions`, `api/merchant_deposits`)
 * authenticates via a header-keyed shared secret. The header name +
 * value live in the `report_server` Secrets bundle so neither rotates
 * through env files.
 */
export interface ReportServerSecret {
  BASE_URL: string;
  HEADER_KEY: string;
  HEADER_VALUE: string;
  TIMEOUT_MS?: number;
}

let cached: ReportServerSecret | null = null;
async function loadSecret(): Promise<ReportServerSecret> {
  if (cached) return cached;
  cached = await Secrets.external<ReportServerSecret & Record<string, unknown>>(
    "report_server",
  );
  return cached;
}

export interface ReportCallContext {
  callFor: string;
  referenceType?: string;
  referenceId?: bigint;
}

/**
 * Single round-trip wrapper for Reports endpoints. Routes through the
 * same audited http client so SOC sees one consistent call trail.
 */
export async function reportPost<T>(
  endpoint: string,
  payload: unknown,
  ctx: ReportCallContext,
): Promise<{ ok: boolean; status: number | null; body: T | null }> {
  const secret = await loadSecret();
  const opts: HttpRequestOptions = {
    method: "POST",
    baseUrl: secret.BASE_URL,
    path: endpoint,
    body: payload,
    headers: { [secret.HEADER_KEY]: secret.HEADER_VALUE },
    timeoutMs: secret.TIMEOUT_MS ?? 90_000,
  };
  const res = await call<{ success?: boolean } & Record<string, unknown>>(
    {
      provider: EXTERNAL_TYPE_REPORT_SERVER,
      callFor: ctx.callFor,
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
    },
    opts,
  );
  const ok = res.status >= 200 && res.status < 300 && res.body?.success === true;
  return { ok, status: res.status, body: res.body as T | null };
}
