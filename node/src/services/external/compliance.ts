import { randomUUID } from "crypto";
import { BeneficiaryTransaction, Prisma, User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { getRedis } from "../../config/redis";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
} from "../../helpers/constants";

/**
 * Mirror of App\\Services\\Compliance + ExternalServices\\Compliance\\ComplianceService.
 *
 * Auth: cached bearer access token from POST /access-token with email/password.
 * Token lives 20 minutes (matches Laravel cache TTL of 1200s).
 *
 * Headers per outbound call:
 *   Authorization: Bearer <accessToken>
 *   Idempotency-Key: <uuid v4>
 *   x-api-key: <api_key>
 */

interface ComplianceSecret extends Record<string, unknown> {
  URL: string;
  EMAIL: string;
  PASSWORD: string;
  API_KEY: string;
  CREATE_TRANSACTION_ENDPOINT: string;
  ACCESS_TOKEN_ENDPOINT: string;
  TIMEOUT_SEC?: number;
}

const TOKEN_CACHE_KEY = "compliance:access_token";
const TOKEN_TTL_SEC = 1200;

let cachedSecret: ComplianceSecret | null = null;
async function loadSecret(): Promise<ComplianceSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<ComplianceSecret>("compliance");
  return cachedSecret;
}

async function getAccessToken(): Promise<string> {
  const r = await getRedis();
  const cached = await r.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const secret = await loadSecret();
  const res = await call<{ data?: { tokens?: { accessToken?: string } } }>(
    { provider: "compliance", callFor: "create" },
    {
      method: "POST",
      baseUrl: secret.URL,
      path: secret.ACCESS_TOKEN_ENDPOINT,
      body: {
        email: secret.EMAIL,
        mfaRequired: true,
        password: secret.PASSWORD,
      },
      timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
    },
  );
  const accessToken = res.body?.data?.tokens?.accessToken;
  if (!accessToken) {
    throw new Error("Compliance access token missing");
  }
  await r.set(TOKEN_CACHE_KEY, accessToken, "EX", TOKEN_TTL_SEC);
  return accessToken;
}

async function authedHeaders(): Promise<Record<string, string>> {
  const secret = await loadSecret();
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Idempotency-Key": randomUUID(),
    "x-api-key": secret.API_KEY,
  };
}

interface ComplianceResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}

async function postJSON<T>(
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<ComplianceResponse<T>> {
  const secret = await loadSecret();
  const headers = await authedHeaders();
  const res = await call<{ success?: boolean; message?: string; data?: T }>(
    {
      provider: "compliance",
      callFor: ctx.callFor,
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
    },
    {
      method: "POST",
      baseUrl: secret.URL,
      path: endpoint,
      body: payload,
      headers,
      timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
    },
  );
  return {
    success: res.body?.success === true,
    message: res.body?.message ?? "",
    data: (res.body?.data ?? null) as T | null,
  };
}

/**
 * Mirror of ComplianceService::make. Submits a payout to the compliance
 * gateway; on success the transaction status flips to
 * COMPLIANCE_INITIATED, on failure to COMPLIANCE_INITIATION_FAILED.
 *
 * The full preparePayload() in Laravel pulls the same beneficiary +
 * remitter shape as ProcessingUnit; we reuse that builder by importing
 * preparePayoutPayload from processingUnit.ts. (Compliance accepts the
 * same payload schema in production.)
 */
export const Compliance = {
  async make(txn: BeneficiaryTransaction, user: User, updateStatus = true): Promise<void> {
    try {
      // Compliance uses the same payload structure as ProcessingUnit.
      // Build it through the shared helper there to avoid drift.
      const { buildPayoutPayload } = await import("./processingUnitPayload");
      const payload = await buildPayoutPayload(txn, user);
      if (!payload) {
        logger.warn(
          { txnId: txn.uniqueId },
          "Compliance.make - cannot build payload (missing related rows)",
        );
        if (updateStatus) {
          await prisma().beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED },
          });
        }
        return;
      }

      const secret = await loadSecret();
      const response = await postJSON<{ status?: string }>(
        secret.CREATE_TRANSACTION_ENDPOINT,
        payload,
        {
          callFor: "create",
          referenceType: "App\\Models\\BeneficiaryTransaction",
          referenceId: txn.id,
        },
      );

      if (!response.success || !response.data) {
        logger.warn(
          { txnId: txn.uniqueId, message: response.message },
          "Compliance create rejected",
        );
        if (updateStatus) {
          await prisma().beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED },
          });
        }
        return;
      }

      // Mirror Laravel ComplianceService::storeComplianceResponse - we
      // persist the provider response into compliance_data so the inbound
      // webhook can match by `compliance_data.transaction_id`.
      await prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: {
          complianceData: response.data as Prisma.InputJsonValue,
          ...(updateStatus
            ? { status: BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED }
            : {}),
        },
      });
      logger.info({ txnId: txn.uniqueId }, "Compliance.make accepted");
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "Compliance.make threw");
      if (updateStatus) {
        await prisma()
          .beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED },
          })
          .catch(() => undefined);
      }
    }
  },
};
