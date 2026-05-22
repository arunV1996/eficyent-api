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
import { uniqueId } from "../../helpers/uniqueId";

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

async function recordFailedInitiation(
  txnId: bigint,
  action: string,
  errorMessage: string,
  startTime: number,
  payload?: unknown,
  endpoint?: string,
): Promise<void> {
  try {
    await prisma().externalServiceCall.create({
      data: {
        externalType: "compliance",
        action: `initiation_failed:${action}`,
        method: "POST",
        endpoint: endpoint ?? null,
        beneficiary_transaction_id: txnId,
        requestPayload: payload ? ({ body: payload } as never) : (null as never),
        response_payload: null as never,
        http_status: null,
        success: false,
        errorMessage,
        response_time_ms: Date.now() - startTime,
      },
    });
  } catch (logErr) {
    logger.error({ err: logErr, txnId: txnId.toString() }, "Failed to write initiation failure audit log");
  }
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
    const startTime = Date.now();
    let payload: unknown = undefined;
    let endpoint: string | undefined = undefined;
    try {
      // Compliance uses the same payload structure as ProcessingUnit.
      // Build it through the shared helper there to avoid drift.
      const { buildPayoutPayload } = await import("./processingUnitPayload");
      const rawPayload = await buildPayoutPayload(txn, user);
      if (!rawPayload) {
        const errorMsg = "Compliance.make - cannot build payload (missing related rows)";
        logger.warn({ txnId: txn.uniqueId }, errorMsg);
        await recordFailedInitiation(txn.id, "build_payload", errorMsg, startTime);
        if (updateStatus) {
          const next = BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED;
          await prisma().beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: next },
          });
          await prisma().beneficiaryTransactionStatusHistory.create({
            data: {
              uniqueId: uniqueId(24),
              beneficiaryTransactionId: txn.id,
              fromStatus: String(txn.status),
              toStatus: String(next),
              changedBy: "system",
              changedByType: "system",
              changedAt: new Date(),
            },
          });
        }
        return;
      }

      // Format payload specifically to satisfy Compliance API schema requirements
      const beneficiaryObj = rawPayload.beneficiary as Record<string, any> | undefined;
      const remitterObj = rawPayload.remitter as Record<string, any> | undefined;

      // Determine the originator/remitter's full name based on whether it is a Sender or a User (and if it is INDIVIDUAL or BUSINESS)
      let originatorFullName = "";
      if (txn.senderId) {
        const sender = await prisma().sender.findUnique({ where: { id: txn.senderId } });
        if (sender) {
          if (Number(sender.type) === 2) { // BUSINESS
            originatorFullName = sender.firstName ?? "";
          } else { // INDIVIDUAL
            originatorFullName = `${sender.firstName || ""} ${sender.lastName || ""}`.trim();
          }
        }
      } else {
        const userInformation = await prisma().userInformation.findFirst({
          where: { userId: user.id }
        });
        if (Number(user.userType) === 2 && userInformation) { // BUSINESS
          originatorFullName = userInformation.businessName ?? "";
        } else { // INDIVIDUAL
          originatorFullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        }
      }

      payload = {
        ...rawPayload,
        "isExternalClient": 1,
        "externalClient": {
            "id": process.env.EXTERNAL_CLIENT_ID,
            "name": process.env.EXTERNAL_CLIENT_NAME,
            "code": process.env.EXTERNAL_CLIENT_CODE
        },
        originator: remitterObj ? {
          ...remitterObj,
          fullName: originatorFullName || remitterObj.fullName || 
            (remitterObj.type === "INDIVIDUAL"
              ? `${remitterObj.first_name || ""} ${remitterObj.last_name || ""}`.trim()
              : remitterObj.business_name || remitterObj.first_name || "")
        } : undefined,
        amount: rawPayload.amount ? Number(rawPayload.amount) : Number(rawPayload.from_amount),
        from_amount: rawPayload.from_amount ? Number(rawPayload.from_amount) : Number(rawPayload.amount),
        currency: rawPayload.receiving_currency || rawPayload.from_currency,
        paymentMethod: rawPayload.rail || "SWIFT",
        beneficiary: beneficiaryObj ? {
          ...beneficiaryObj,
          fullName: beneficiaryObj.fullName || 
            (beneficiaryObj.type === "INDIVIDUAL" 
              ? `${beneficiaryObj.first_name || ""} ${beneficiaryObj.last_name || ""}`.trim()
              : beneficiaryObj.business_name || beneficiaryObj.first_name || "")
        } : undefined
      };

      let secret: ComplianceSecret;
      try {
        secret = await loadSecret();
        endpoint = secret.CREATE_TRANSACTION_ENDPOINT;
      } catch (err) {
        const errorMsg = `Failed to load compliance secrets: ${err instanceof Error ? err.message : String(err)}`;
        await recordFailedInitiation(txn.id, "load_secrets", errorMsg, startTime, payload);
        throw err;
      }

      let response;
      try {
        response = await postJSON<{ status?: string }>(
          endpoint,
          payload,
          {
            callFor: "create",
            referenceType: "App\\Models\\BeneficiaryTransaction",
            referenceId: txn.id,
          },
        );
      } catch (err) {
        // If postJSON threw, check if an audit log was written by call().
        // If no audit log was created, log the exception.
        const existingAudit = await prisma().externalServiceCall.findFirst({
          where: {
            beneficiary_transaction_id: txn.id,
            externalType: "compliance",
            action: "create",
          },
        });
        if (!existingAudit) {
          const errorMsg = `Pre-request or authentication failure: ${err instanceof Error ? err.message : String(err)}`;
          await recordFailedInitiation(txn.id, "authenticate_or_post", errorMsg, startTime, payload, endpoint);
        }
        throw err;
      }

      if (!response.success || !response.data) {
        logger.warn(
          { txnId: txn.uniqueId, message: response.message },
          "Compliance create rejected",
        );
        if (updateStatus) {
          const next = BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED;
          await prisma().beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: next },
          });
          await prisma().beneficiaryTransactionStatusHistory.create({
            data: {
              uniqueId: uniqueId(24),
              beneficiaryTransactionId: txn.id,
              fromStatus: String(txn.status),
              toStatus: String(next),
              changedBy: "system",
              changedByType: "system",
              changedAt: new Date(),
            },
          });
        }
        return;
      }

      // Mirror Laravel ComplianceService::storeComplianceResponse - we
      // persist the provider response into compliance_data so the inbound
      // webhook can match by `compliance_data.transaction_id`.
      const next = updateStatus ? BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED : txn.status;
      await prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: {
          complianceData: response.data as Prisma.InputJsonValue,
          ...(updateStatus ? { status: next } : {}),
        },
      });
      if (updateStatus && next !== txn.status) {
        await prisma().beneficiaryTransactionStatusHistory.create({
          data: {
            uniqueId: uniqueId(24),
            beneficiaryTransactionId: txn.id,
            fromStatus: String(txn.status),
            toStatus: String(next),
            changedBy: "system",
            changedByType: "system",
            changedAt: new Date(),
          },
        });
      }
      logger.info({ txnId: txn.uniqueId }, "Compliance.make accepted");
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "Compliance.make threw");
      if (updateStatus) {
        const next = BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED;
        await prisma()
          .beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: next },
          })
          .catch(() => undefined);
        await prisma().beneficiaryTransactionStatusHistory.create({
          data: {
            uniqueId: uniqueId(24),
            beneficiaryTransactionId: txn.id,
            fromStatus: String(txn.status),
            toStatus: String(next),
            changedBy: "system",
            changedByType: "system",
            changedAt: new Date(),
          },
        }).catch(() => undefined);
      }
    }
  },
};
