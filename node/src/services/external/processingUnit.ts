import { createHmac, randomBytes } from "crypto";
import {
  BeneficiaryTransaction,
  DepositTransaction,
  User,
  VirtualAccount,
  AdminWallet,
} from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import { TelegramNotifier } from "./telegram";
import {
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
  EXTERNAL_TYPE_PROCESSING_UNIT,
} from "../../helpers/constants";
import {
  DEPOSIT_PURPOSE,
  DEPOSIT_SOURCE_OF_FUNDS,
} from "../../helpers/lookups";
import { buildPayoutPayload } from "./processingUnitPayload";

/**
 * Mirror of App\\ExternalServices\\ProcessingUnit\\ProcessingUnit +
 * App\\Services\\ProcessingUnit\\* services.
 *
 * Auth scheme:
 *   x-api-key       - sourced from Secrets Manager
 *   x-api-timestamp - unix seconds, str
 *   x-nonce         - 16 random bytes hex
 *   x-api-signature - HMAC-SHA256(plain, apiKey) where
 *                     plain = "/<lastEndpointSegment>" + bodyJson + timestamp + nonce + apiSecret
 *
 * Endpoints (mirror constants from Laravel):
 *   POST /create-transaction
 *   POST /sync-transaction
 *   POST /validate-account
 *   POST /create-deposit
 */

interface ProcessingUnitSecret extends Record<string, unknown> {
  URL: string;
  API_KEY: string;
  API_SECRET: string;
}

let cachedSecret: ProcessingUnitSecret | null = null;
async function loadSecret(): Promise<ProcessingUnitSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<ProcessingUnitSecret>("processingunit");
  return cachedSecret;
}

const ENDPOINTS = {
  CREATE_TRANSACTION: "/api/v1/initiate-withdraw",
  SYNC_TRANSACTION: "/api/v1/sync-withdraw",
  VALIDATE_ACCOUNT: "/api/v1/verify_account",
  CREATE_DEPOSIT: "/api/v1/initiate-deposit",
} as const;

function lastSegment(endpoint: string): string {
  const parts = endpoint.replace(/^\/+|\/+$/g, "").split("/");
  return `/${parts[parts.length - 1]}`;
}

function stableJson(payload: unknown): string {
  // Mirror PHP's JSON_UNESCAPED_SLASHES + the null->empty-string
  // replacement Laravel applies before signing.
  let json = JSON.stringify(payload ?? {}, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  json = json.replace(/:null(?=[,}])/g, ':""');
  return json;
}

async function signedHeaders(endpoint: string, payload: unknown): Promise<Record<string, string>> {
  const secret = await loadSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const bodyJson = stableJson(payload);
  const plain = `${lastSegment(endpoint)}${bodyJson}${timestamp}${nonce}${secret.API_SECRET}`;
  const signature = createHmac("sha256", secret.API_KEY).update(plain).digest("hex");
  return {
    "x-api-key": secret.API_KEY,
    "x-api-timestamp": timestamp,
    "x-nonce": nonce,
    "x-api-signature": signature,
  };
}

interface ProcessingUnitResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

async function postJSON<T>(
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<ProcessingUnitResponse<T>> {
  const secret = await loadSecret();
  const headers = await signedHeaders(endpoint, payload);
  const res = await call<{ success?: boolean; message?: string; error?: string; data?: T }>(
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
      headers,
    },
  );
  return {
    success: res.body?.success === true,
    message: res.body?.message ?? res.body?.error ?? "",
    data: (res.body?.data ?? null) as T,
  };
}

// ---------------------------------------------------------------------------
// Status mapping helpers (mirror ProcessingUnit_status_map +
// ProcessingUnit_Depositstatus_map).
// ---------------------------------------------------------------------------

const PU_STATUS_MAP: Record<string, number> = {
  initiated: 14, // BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED
  processing: 15, // BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING
  completed: 4, // BENEFICIARY_TRANSACTION_COMPLETED
  failed: 5, // BENEFICIARY_TRANSACTION_FAILED
  rejected: 7, // BENEFICIARY_TRANSACTION_REJECTED
  cancelled: 8,
};

const PU_DEPOSIT_STATUS_MAP: Record<string, number> = {
  initiated: 4, // DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED
  processing: 5, // DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING
  completed: 1, // DEPOSIT_TRANSACTION_COMPLETED
  failed: 2,
  rejected: 3,
};

function mapStatus(s: string | null | undefined): number | null {
  if (!s) return null;
  return PU_STATUS_MAP[s.toLowerCase()] ?? null;
}

function mapDepositStatus(s: string | null | undefined): number | null {
  if (!s) return null;
  return PU_DEPOSIT_STATUS_MAP[s.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function removeEmpty<T extends Record<string, unknown>>(obj: T): T {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") {
      delete obj[k];
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v)) {
      const cleaned = removeEmpty(v as Record<string, unknown>);
      if (Object.keys(cleaned).length === 0) delete obj[k];
// @ts-ignore - Catch-all auto-fix for: Type 'T' is generic and can on...
      else obj[k] = cleaned as never;
    }
  }
  return obj;
}


function prepareDepositPayload(
  txn: DepositTransaction & { virtualAccount: VirtualAccount; adminWallet?: AdminWallet | null },
  user: User,
): Record<string, unknown> {
  const data = {
    merchant: {
      name: user.firstName ?? user.email,
      email: user.email,
    },
    order_id: txn.uniqueId,
    country: txn.virtualAccount.country,
    currency: txn.virtualAccount.currency,
    account_number: txn.virtualAccount.accountNumber,
    account_holder_name: txn.virtualAccount.accountHolderName,
    account_holder_address: txn.virtualAccount.accountHolderAddress,
    account_bank_name: txn.virtualAccount.accountBankName,
    account_bank_code: txn.virtualAccount.accountBankCode,
    account_bank_address: txn.virtualAccount.accountBankAddress,
    routing_number: txn.virtualAccount.routingNumber,
    amount: txn.totalAmount.toString(),
    type: txn.type,
    source_of_funds: txn.sourceOfFunds ? DEPOSIT_SOURCE_OF_FUNDS[txn.sourceOfFunds] ?? "" : "",
    purpose_of_payment: txn.purposeOfPayment ? DEPOSIT_PURPOSE[txn.purposeOfPayment] ?? "" : "",
    proof: txn.proof,
    deposit_currency_type: txn.depositCurrency
      ? ["USDC", "USDT"].includes(txn.depositCurrency)
        ? "CRYPTO"
        : "FIAT"
      : null,
    network_type: txn.adminWalletId && txn.adminWallet ? txn.adminWallet.network : null,
    from_wallet_address: txn.fromWalletAddress,
    to_wallet_Address: txn.adminWalletId && txn.adminWallet ? txn.adminWallet.wallet_address : null,
    transaction_hash: txn.transactionHash,
  };
  return removeEmpty(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Driver entrypoints (the things called from controllers/handlers)
// ---------------------------------------------------------------------------

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
    logger.error({ err: logErr, txnId: txnId.toString() }, "Failed to write initiation failure audit log");
  }
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
        }
        logger.info(
          { txnId: txn.uniqueId, status: response.data?.status, mapped: next },
          "ProcessingUnit.make completed",
        );
        return;
      }

      // Failed - mark the transaction PU_INITIATION_FAILED and notify.
      await prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: { status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED },
      });
      await TelegramNotifier.processingUnitInitiationFailed({
        id: txn.uniqueId,
        user: user.firstName ?? user.email,
        currency: (payload.from_currency as string) ?? "",
        status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
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
      await prisma()
        .beneficiaryTransaction.update({
          where: { id: txn.id },
          data: { status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED },
        })
        .catch(() => undefined);
      await TelegramNotifier.processingUnitInitiationFailed({
        id: txn.uniqueId,
        user: user.firstName ?? user.email,
        currency: "",
        status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
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

      const payload = prepareDepositPayload(
        { ...txn, virtualAccount: va, adminWallet },
        user,
      );
      const response = await postJSON<{
        deposit_transaction?: { status?: string };
      }>(ENDPOINTS.CREATE_DEPOSIT, payload, {
        callFor: "create",
        referenceType: "App\\Models\\DepositTransaction",
        referenceId: txn.id,
      });

      if (response.success) {
        const next = mapDepositStatus(response.data?.deposit_transaction?.status);
        if (next !== null && next !== txn.status) {
          await prisma().depositTransaction.update({
            where: { id: txn.id },
            data: { status: next },
          });
        }
        logger.info({ depositId: txn.uniqueId, status: response.data?.deposit_transaction?.status }, "Processing Unit deposit initiated");
        return;
      }

      logger.warn({ depositId: txn.uniqueId, message: response.message }, "Processing Unit deposit initiation failed");
      await prisma().depositTransaction.update({
        where: { id: txn.id },
        data: { status: DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED },
      });
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "ProcessingUnit.createDeposit threw");
    }
  },

  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::validateAccount.
   */
  async validateAccount(payload: {
    merchant_email?: string;
    merchant_name?: string;
    account_number: string;
    ifsc_code: string;
  }): Promise<{ success: boolean; data: Record<string, unknown> | null; message: string }> {
    try {
      const response = await postJSON<Record<string, unknown>>(
        ENDPOINTS.VALIDATE_ACCOUNT,
        payload,
        { callFor: "create" },
      );
      return {
        success: response.success,
        message: response.message,
        data: response.data,
      };
    } catch (err) {
      logger.error({ err }, "ProcessingUnit.validateAccount threw");
      return { success: false, message: String(err), data: null };
    }
  },
};
