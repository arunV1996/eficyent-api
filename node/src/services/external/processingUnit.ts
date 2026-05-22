import {
  BeneficiaryTransaction,
  DepositTransaction,
  User,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
  EXTERNAL_TYPE_PROCESSING_UNIT,
} from "../../helpers/constants";
import { logger } from "../../helpers/logger";
import { TelegramNotifier } from "./telegram";
import { buildPayoutPayload } from "./processingUnitPayload";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { mapProcessingUnitWithdrawStatus } from "../processingUnit/statusMap";
import { uniqueId } from "../../helpers/uniqueId";
import crypto from "crypto";

/**
 * Shared config for the Processing Unit API.
 */
interface PUSecret extends Record<string, unknown> {
  URL: string;
  API_KEY: string;
  API_SECRET: string;
  TIMEOUT_SEC?: number;
}

const ENDPOINTS = {
  CREATE_TRANSACTION: "api/v1/initiate-withdraw",
  VALIDATE_ACCOUNT: "api/v1/verify_account",
};

let cachedSecret: PUSecret | null = null;
async function loadSecret(): Promise<PUSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<PUSecret>("processingunit");
  return cachedSecret;
}

/**
 * Implementation of signature logic from Laravel ProcessingUnit::generateSignature.
 */
function signRequest(secret: PUSecret, endpoint: string, bodyJson: string) {
  const apiKey = secret.API_KEY;
  const apiSecret = secret.API_SECRET;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  // Laravel: $segments = explode('/', trim($endpoint, '/')); $endpointForSignature = '/' . end($segments);
  const segments = endpoint.split("/").filter(Boolean);
  const endpointForSignature = "/" + (segments[segments.length - 1] || "");

  // Laravel: $bodyJson = preg_replace('/:null(?=[,}])/', ':""', $bodyJson);
  const sanitizedBody = bodyJson.replace(/:null(?=[,}])/g, ':""');

  const plainContent = endpointForSignature + sanitizedBody + timestamp + nonce + apiSecret;

  const signature = crypto
    .createHmac("sha256", apiKey)
    .update(plainContent)
    .digest("hex");

  return {
    apiKey,
    timestamp,
    nonce,
    signature,
  };
}

async function postJSON<T>(
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<{ success: boolean; message: string; data: T | null }> {
  try {
    const secret = await loadSecret();
    const res = await call<{
      success?: boolean;
      message?: string;
      data?: T;
      error?: string;
    }>(
      {
        provider: "processingunit",
        callFor: ctx.callFor,
        referenceType: ctx.referenceType,
        referenceId: ctx.referenceId,
      },
      {
        method: "POST",
        baseUrl: secret.URL,
        path: endpoint,
        body: payload,
        signRequest: async (signCtx) => {
          const sig = signRequest(secret, endpoint, signCtx.bodyJson);
          signCtx.headers["x-api-key"] = sig.apiKey;
          signCtx.headers["x-api-timestamp"] = sig.timestamp;
          signCtx.headers["x-nonce"] = sig.nonce;
          signCtx.headers["x-api-signature"] = sig.signature;
        },
        timeoutMs: (secret.TIMEOUT_SEC ?? 90) * 1000,
      },
    );

    return {
      success: res.body?.success === true,
      message: res.body?.message ?? res.body?.error ?? "",
      data: res.body?.data ?? (res.body as T) ?? null,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
      data: null,
    };
  }
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
        externalType: "processingunit",
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
    logger.error(
      { err: logErr, txnId: txnId.toString() },
      "Failed to write initiation failure audit log",
    );
  }
}

function mapStatus(puStatus?: string): number | null {
  if (!puStatus) return null;
  return mapProcessingUnitWithdrawStatus(puStatus).mapped;
}

export const ProcessingUnit = {
  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::make.
   * Initiates a payout through the upstream Processing Unit.
   */
  async make(txn: BeneficiaryTransaction, user: User): Promise<void> {
    const startTime = Date.now();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = await buildPayoutPayload(txn, user);

      if (!payload) {
        const errorMsg = "ProcessingUnit.make - buildPayoutPayload returned null (missing related data)";
        logger.warn({ txnId: txn.uniqueId }, errorMsg);
        await recordFailedInitiation(txn.id, "build_payload", errorMsg, startTime);
        return;
      }

      const response = await postJSON<{ status?: string }>(
        ENDPOINTS.CREATE_TRANSACTION,
        payload,
        {
          callFor: "create",
          referenceType: "App\\Models\\BeneficiaryTransaction",
          referenceId: txn.id,
        },
      );

      if (response.success) {
        const next = mapStatus(response.data?.status);
        if (next !== null && next !== txn.status) {
          await prisma().beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: next, externalType: EXTERNAL_TYPE_PROCESSING_UNIT },
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
        logger.info(
          { txnId: txn.uniqueId, status: response.data?.status, mapped: next },
          "ProcessingUnit.make completed",
        );
        return;
      }

      // Failed - mark the transaction PU_INITIATION_FAILED and notify.
      const failureStatus = BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED;
      await prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: { status: failureStatus },
      });
      await prisma().beneficiaryTransactionStatusHistory.create({
        data: {
          uniqueId: uniqueId(24),
          beneficiaryTransactionId: txn.id,
          fromStatus: String(txn.status),
          toStatus: String(failureStatus),
          changedBy: "system",
          changedByType: "system",
          changedAt: new Date(),
        },
      });

      await TelegramNotifier.processingUnitInitiationFailed({
        id: txn.uniqueId,
        user: user.firstName ?? user.email,
        currency: (payload.from_currency as string) ?? "",
        status: failureStatus,
        message: response.message,
        created_at: txn.createdAt?.toISOString() ?? "",
      });
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "ProcessingUnit.make threw");
      const existingAudit = await prisma().externalServiceCall.findFirst({
        where: {
          beneficiary_transaction_id: txn.id,
          externalType: "processingunit",
          action: "create",
        },
      });
      if (!existingAudit) {
        const errorMsg = `Pre-request or configuration failure: ${err instanceof Error ? err.message : String(err)}`;
        await recordFailedInitiation(txn.id, "make_failure", errorMsg, startTime, payload, ENDPOINTS.CREATE_TRANSACTION);
      }
      
      const failureStatus = BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED;
      await prisma()
        .beneficiaryTransaction.update({
          where: { id: txn.id },
          data: { status: failureStatus },
        })
        .catch(() => undefined);
      
      await prisma().beneficiaryTransactionStatusHistory.create({
        data: {
          uniqueId: uniqueId(24),
          beneficiaryTransactionId: txn.id,
          fromStatus: String(txn.status),
          toStatus: String(failureStatus),
          changedBy: "system",
          changedByType: "system",
          changedAt: new Date(),
        },
      }).catch(() => undefined);

      await TelegramNotifier.processingUnitInitiationFailed({
        id: txn.uniqueId,
        user: user.firstName ?? user.email,
        currency: "",
        status: failureStatus,
        message: err instanceof Error ? err.message : String(err),
        created_at: txn.createdAt?.toISOString() ?? "",
      });
    }
  },

  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::createDeposit.
   */
  async createDeposit(txn: DepositTransaction): Promise<void> {
    try {
      const va = await prisma().virtualAccount.findUnique({
        where: { id: txn.virtualAccountId },
      });
      const user = await prisma().user.findUnique({ where: { id: txn.userId } });
      const adminWallet = txn.adminWalletId
        ? await prisma().adminWallet.findUnique({ where: { id: txn.adminWalletId } })
        : null;

      if (!va || !user) return;

      const payload = {
        amount: txn.totalAmount,
        currency: va.currency,
        order_id: txn.uniqueId,
        merchant: {
          name: user.firstName ?? user.email,
          email: user.email,
        },
        wallet_address: (adminWallet as any)?.address ?? null,
      };

      await postJSON(
        "api/v1/initiate-deposit",
        payload,
        {
          callFor: "create",
          referenceType: "App\\Models\\DepositTransaction",
          referenceId: txn.id,
        },
      );
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "ProcessingUnit.createDeposit threw");
    }
  },

  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::validateAccount.
   */
  async validateAccount(payload: unknown): Promise<any> {
    const response = await postJSON(
      ENDPOINTS.VALIDATE_ACCOUNT,
      payload,
      {
        callFor: "validate_account",
      },
    );
    return response;
  },
};
