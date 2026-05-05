import { createHmac } from "crypto";
import { User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  ID_VERIFIED_BY_HERALD_SUMSUB,
  IDENTITY_VERIFICATION_COMPLETED,
  IDENTITY_VERIFICATION_INITIATED,
  ONBOARDING_STEP_FOUR_COMPLETED,
} from "../../helpers/constants";
import { KycDriver } from "./kycContract";

/**
 * Mirror of App\\Services\\HeraldSumsub + ExternalServices\\Kyc\\Herald.
 *
 * Auth scheme (HMAC, like ProcessingUnit):
 *   X-Api-Key       - configured api key
 *   X-Api-Timestamp - unix seconds
 *   X-Api-Signature - HMAC-SHA256(plain, apiKey)
 *
 *   plain = "{endpointPath}{json(body)}{timestamp}{saltKey}"
 *
 * Endpoints from secret:
 *   POST /access-token   - initiate verification, returns kyc_status + redirect_url
 *   GET  /status         - poll verification status
 */

interface HeraldSecret extends Record<string, unknown> {
  URL: string;
  X_API_KEY: string;
  SALT_KEY: string;
  MERCHANT_ID: string;
  ACCESS_TOKEN_ENDPOINT: string;
  STATUS_ENDPOINT: string;
}

let cachedSecret: HeraldSecret | null = null;
async function loadSecret(): Promise<HeraldSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<HeraldSecret>("herald_sumsub");
  return cachedSecret;
}

function signedHeaders(
  secret: HeraldSecret,
  endpointPath: string,
  body: unknown,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const json = JSON.stringify(body ?? {});
  const plain = `${endpointPath}${json}${timestamp}${secret.SALT_KEY}`;
  const signature = createHmac("sha256", secret.X_API_KEY)
    .update(plain)
    .digest("hex");
  return {
    "X-Api-Key": secret.X_API_KEY,
    "X-Api-Timestamp": timestamp,
    "X-Api-Signature": signature,
  };
}

class HeraldSumsubDriver implements KycDriver {
  async make(user: User): Promise<string> {
    const secret = await loadSecret();
    const body = {
      first_name: user.firstName,
      last_name: user.lastName,
      middle_name: user.middleName ?? "",
      dob: user.dob,
      email: user.email,
      mobile: user.mobile,
      user_id: secret.MERCHANT_ID,
    };
    const headers = signedHeaders(secret, secret.ACCESS_TOKEN_ENDPOINT, body);
    const res = await call<{
      success?: boolean;
      message?: string;
      data?: { kyc_status?: string; redirect_url?: string };
    }>(
      {
        provider: "herald_sumsub",
        callFor: "create",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
      {
        method: "POST",
        baseUrl: secret.URL,
        path: secret.ACCESS_TOKEN_ENDPOINT,
        body,
        headers,
        timeoutMs: 30_000,
      },
    );
    if (!res.body?.success) {
      throw new Error(res.body?.message ?? "Herald KYC initiate failed");
    }
    const data = res.body.data ?? {};
    if (data.kyc_status) {
      await this.applyStatus(user, data.kyc_status, null);
    }
    return data.redirect_url ?? "";
  }

  async status(user: User): Promise<void> {
    const secret = await loadSecret();
    const queryBody = { email: user.email };
    const headers = signedHeaders(secret, secret.STATUS_ENDPOINT, queryBody);
    const res = await call<{
      success?: boolean;
      message?: string;
      data?: { kyc_status?: string; [k: string]: unknown };
    }>(
      {
        provider: "herald_sumsub",
        callFor: "status_check",
        referenceType: "App\\Models\\User",
        referenceId: user.id,
      },
      {
        method: "GET",
        baseUrl: secret.URL,
        path: secret.STATUS_ENDPOINT,
        query: queryBody,
        headers,
        timeoutMs: 30_000,
      },
    );
    if (!res.body?.success || !res.body.data?.kyc_status) {
      logger.info(
        { userId: user.id.toString() },
        "Herald KYC status: no update from provider",
      );
      return;
    }
    await this.applyStatus(user, res.body.data.kyc_status, res.body.data);
  }

  private async applyStatus(
    user: User,
    status: string,
    data: Record<string, unknown> | null,
  ): Promise<void> {
    if (status === "Approved") {
      await prisma().user.update({
        where: { id: user.id },
        data: {
          idVerification: IDENTITY_VERIFICATION_COMPLETED,
          idVerifiedBy: ID_VERIFIED_BY_HERALD_SUMSUB,
          onboardingStep: ONBOARDING_STEP_FOUR_COMPLETED,
          ...(data ? { idVerificationData: data as never } : {}),
        },
      });
    } else if (status === "Initiated") {
      await prisma().user.update({
        where: { id: user.id },
        data: {
          idVerification: IDENTITY_VERIFICATION_INITIATED,
          idVerifiedBy: ID_VERIFIED_BY_HERALD_SUMSUB,
          ...(data ? { idVerificationData: data as never } : {}),
        },
      });
    } else if (data) {
      await prisma().user.update({
        where: { id: user.id },
        data: { idVerificationData: data as never },
      });
    }
  }
}

export const HeraldSumsub = new HeraldSumsubDriver();
