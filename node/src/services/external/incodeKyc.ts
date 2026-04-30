import { User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  ID_VERIFIED_BY_INCODE,
  IDENTITY_VERIFICATION_COMPLETED,
  IDENTITY_VERIFICATION_FAILED,
  IDENTITY_VERIFICATION_INITIATED,
  IDENTITY_VERIFICATION_PROCESSING,
  ONBOARDING_STEP_FOUR_COMPLETED,
} from "../../helpers/constants";
import { KycDriver } from "./kycContract";

/**
 * Mirror of App\\Services\\Incode + ExternalServices\\Kyc\\Incode\\IncodeKyc.
 *
 * Auth: Api-Version + x-api-key headers, plus X-Incode-Hardware-Id on
 * scoped calls. Uses the per-user `token` returned by /omni/start as the
 * hardware id for subsequent calls.
 *
 * Endpoints (sourced from secret):
 *   POST /omni/start           - start a verification, returns interviewId + token
 *   GET  /omni/get-url         - get the redirect URL for the qr/web component
 *   GET  /omni/get-score       - poll the score; provider returns overall.status
 */

interface IncodeSecret extends Record<string, unknown> {
  URL: string;
  API_KEY: string;
  API_VERSION: string;
  CONFIGURATION_ID: string;
  CLIENT_ID: string;
  TIMEOUT_SEC?: number;
  IS_SANDBOX?: boolean;
  OMNI_START_ENDPOINT: string;
  GET_URL_ENDPOINT: string;
  GET_SCORE_ENDPOINT: string;
}

let cachedSecret: IncodeSecret | null = null;
async function loadSecret(): Promise<IncodeSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<IncodeSecret>("incode");
  return cachedSecret;
}

function baseHeaders(secret: IncodeSecret): Record<string, string> {
  return {
    "Api-Version": secret.API_VERSION,
    "x-api-key": secret.API_KEY,
  };
}

/**
 * Map Incode's overall.status to our IDENTITY_VERIFICATION_* enum.
 * Mirror of format_incode_status() in ViewHelper.php.
 */
function formatIncodeStatus(status: string | undefined | null): number {
  switch (String(status ?? "").toUpperCase()) {
    case "OK":
    case "APPROVED":
      return IDENTITY_VERIFICATION_COMPLETED;
    case "FAIL":
    case "FAILED":
    case "DECLINED":
      return IDENTITY_VERIFICATION_FAILED;
    case "PROCESSING":
    case "PENDING":
      return IDENTITY_VERIFICATION_PROCESSING;
    default:
      return IDENTITY_VERIFICATION_INITIATED;
  }
}

class IncodeDriver implements KycDriver {
  async make(user: User): Promise<string> {
    const secret = await loadSecret();
    // 1. Start an OMNI session.
    const startRes = await call<{
      interviewId?: string;
      token?: string;
      message?: string;
    }>(
      {
        provider: "incode",
        callFor: "create",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
      {
        method: "POST",
        baseUrl: secret.URL,
        path: secret.OMNI_START_ENDPOINT,
        body: { configurationId: secret.CONFIGURATION_ID },
        headers: baseHeaders(secret),
        timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
      },
    );
    if (!startRes.body?.interviewId || !startRes.body?.token) {
      throw new Error(startRes.body?.message ?? "Incode start failed");
    }
    const { interviewId, token } = startRes.body;

    // 2. Get redirect URL.
    const urlRes = await call<{ url?: string; message?: string }>(
      {
        provider: "incode",
        callFor: "create",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
      {
        method: "GET",
        baseUrl: secret.URL,
        path: secret.GET_URL_ENDPOINT,
        query: { components: "qr", clientId: secret.CLIENT_ID },
        headers: { ...baseHeaders(secret), "X-Incode-Hardware-Id": token },
        timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
      },
    );
    if (!urlRes.body?.url) {
      throw new Error(urlRes.body?.message ?? "Incode get-url failed");
    }

    // 3. Persist initiated state.
    await prisma().user.update({
      where: { id: user.id },
      data: {
        idVerification: IDENTITY_VERIFICATION_INITIATED,
        idVerifiedBy: ID_VERIFIED_BY_INCODE,
        idVerificationData: { interviewId, token } as never,
      },
    });
    return urlRes.body.url;
  }

  async status(user: User): Promise<void> {
    const secret = await loadSecret();
    const data = (user.idVerificationData ?? {}) as {
      interviewId?: string;
      token?: string;
    };
    if (!data.interviewId || !data.token) return;

    const res = await call<{ overall?: { status?: string }; [k: string]: unknown }>(
      {
        provider: "incode",
        callFor: "status_check",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
      {
        method: "GET",
        baseUrl: secret.URL,
        path: secret.GET_SCORE_ENDPOINT,
        query: { id: data.interviewId },
        headers: { ...baseHeaders(secret), "X-Incode-Hardware-Id": data.token },
        timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
      },
    );
    const overall = res.body?.overall;
    if (!overall) return;
    const next = formatIncodeStatus(overall.status);
    await prisma().user.update({
      where: { id: user.id },
      data: {
        idVerification: next,
        idVerifiedBy: ID_VERIFIED_BY_INCODE,
        ...(next === IDENTITY_VERIFICATION_COMPLETED
          ? {
              idVerificationData: res.body as never,
              onboardingStep: ONBOARDING_STEP_FOUR_COMPLETED,
            }
          : {}),
      },
    });
    logger.info(
      { userId: user.id.toString(), status: overall.status, mapped: next },
      "Incode KYC status updated",
    );
  }
}

export const Incode = new IncodeDriver();
