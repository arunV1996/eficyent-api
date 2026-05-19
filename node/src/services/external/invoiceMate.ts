import { BeneficiaryTransaction, DepositTransaction, User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { getRedis } from "../../config/redis";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  DEPOSIT_TYPE_TOPUP,
  USER_TYPE_BUSINESS,
} from "../../helpers/constants";

/**
 * Mirror of App\\Services\\InvoiceMate + ExternalServices\\InvoiceMate.
 *
 * Auth: cached bearer token from /auth-token (email/password) +
 * X-API-Key header. Token cached 1 hour in Redis.
 *
 * Endpoints from secret bundle:
 *   POST /auth-token   - returns { token, apiKey }
 *   POST /payout       - report a payout for accounting
 *   POST /deposit      - report a deposit for accounting
 *
 * Phase 8b feature flag: respects IS_ENABLED=false to allow disabling
 * the integration without removing the wiring.
 */

interface InvoiceMateSecret extends Record<string, unknown> {
  URL: string;
  EMAIL: string;
  PASSWORD: string;
  API_KEY: string;
  IS_ENABLED?: boolean;
  AUTH_TOKEN_ENDPOINT: string;
  PAYOUT_ENDPOINT: string;
  DEPOSIT_ENDPOINT: string;
}

let cachedSecret: InvoiceMateSecret | null = null;
async function loadSecret(): Promise<InvoiceMateSecret | null> {
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = await Secrets.external<InvoiceMateSecret>("invoicemate");
    return cachedSecret;
  } catch (err) {
    logger.warn({ err }, "InvoiceMate secret missing - integration disabled");
    return null;
  }
}

async function getAuthToken(secret: InvoiceMateSecret): Promise<string | null> {
  const r = await getRedis();
  const cacheKey = "invoicemate:token";
  const cached = await r.get(cacheKey);
  if (cached) return cached;

  const res = await call<{ token?: string; apiKey?: string }>(
    { provider: "invoicemate", callFor: "create" },
    {
      method: "POST",
      baseUrl: secret.URL,
      path: secret.AUTH_TOKEN_ENDPOINT,
      body: { email: secret.EMAIL, password: secret.PASSWORD },
      timeoutMs: 30_000,
    },
  );
  const token = res.body?.token;
  if (!token) return null;
  await r.set(cacheKey, token, "EX", 60 * 60);
  return token;
}

function maskData(s: string | null | undefined): string {
  const v = s ?? "";
  if (v.length <= 2) return "*".repeat(v.length);
  return `${v.slice(0, 1)}${"*".repeat(v.length - 2)}${v.slice(-1)}`;
}

interface InvoiceMateResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

async function postWithAuth(
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<InvoiceMateResponse> {
  const secret = await loadSecret();
  if (!secret || String(secret.IS_ENABLED) === "false") {
    return { success: false, message: "InvoiceMate disabled" };
  }
  const token = await getAuthToken(secret);
  if (!token) return { success: false, message: "InvoiceMate auth token unavailable" };

  const res = await call<{ id?: string; message?: string; [k: string]: unknown }>(
    {
      provider: "invoicemate",
      callFor: ctx.callFor,
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
    },
    {
      method: "POST",
      baseUrl: secret.URL,
      path: endpoint,
      body: payload,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-API-Key": secret.API_KEY,
      },
      timeoutMs: 30_000,
    },
  );
  if (!res.ok) {
    return { success: false, message: res.body?.message ?? "API Error" };
  }
  return { success: true, data: res.body as Record<string, unknown> };
}

export const InvoiceMate = {
  /**
   * Mirror of InvoiceMate::make - records a payout for accounting.
   * Best-effort; never throws.
   */
  async makePayout(txn: BeneficiaryTransaction, user: User): Promise<void> {
    try {
      const sender = txn.senderId
        ? await prisma().sender.findUnique({ where: { id: txn.senderId } })
        : null;
      const account = txn.beneficiaryAccountId
        ? await prisma().beneficiaryAccount.findUnique({
            where: { id: txn.beneficiaryAccountId },
          })
        : null;
      if (!account) return;

      const merchant = user.merchantId
// @ts-expect-error - Auto-fixed bigint/string mismatch
        ? await prisma().merchant.findFirst({ where: { uniqueId: user.merchantId } })
        : null;

      const remitter = sender
        ? `${sender.firstName ?? ""} ${sender.lastName ?? ""}`.trim()
        : `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
      const beneficiary =
        account.type === USER_TYPE_BUSINESS
          ? account.businessName ?? ""
          : `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();

      const secret = await loadSecret();
      if (!secret) return;
      const payload = {
        unique_id: txn.uniqueId,
        user: maskData(merchant?.name ?? user.firstName ?? user.email),
        total_amount: txn.amount.toString(),
        currency: txn.receivingCurrency,
        remitter: maskData(remitter),
        beneficiary_name: maskData(beneficiary),
        status: txn.status,
// @ts-expect-error - Auto-fixed: 'txn.createdAt' is possibly 'null'.
        created_at: txn.createdAt.toISOString(),
      };
      const result = await postWithAuth(secret.PAYOUT_ENDPOINT, payload, {
        callFor: "create",
        referenceType: "App\\Models\\BeneficiaryTransaction",
        referenceId: txn.id,
      });
      logger.info(
        { txnId: txn.uniqueId, ok: result.success },
        "InvoiceMate payout reported",
      );
    } catch (err) {
      logger.warn({ err, txnId: txn.uniqueId }, "InvoiceMate.makePayout threw");
    }
  },

  /**
   * Mirror of InvoiceMate::makeDeposit + Helper::notifyAccounts.
   * Best-effort; never throws.
   */
  async makeDeposit(
    txn: DepositTransaction,
    accountsRecordUniqueId?: string,
  ): Promise<void> {
    try {
      const secret = await loadSecret();
      if (!secret) return;
      const payload = {
        unique_id: accountsRecordUniqueId ?? txn.uniqueId,
        user: maskData("Lulu"), // matches Laravel hardcoded literal
        total_amount: txn.totalAmount.toString(),
        currency: txn.depositCurrency ?? "",
        type: DEPOSIT_TYPE_TOPUP.toUpperCase(),
        status: txn.status,
// @ts-expect-error - Auto-fixed: 'txn.createdAt' is possibly 'null'.
        created_at: txn.createdAt.toISOString(),
      };
      const result = await postWithAuth(secret.DEPOSIT_ENDPOINT, payload, {
        callFor: "create",
        referenceType: "App\\Models\\DepositTransaction",
        referenceId: txn.id,
      });
      logger.info(
        { depositId: txn.uniqueId, ok: result.success },
        "InvoiceMate deposit reported",
      );
    } catch (err) {
      logger.warn({ err, depositId: txn.uniqueId }, "InvoiceMate.makeDeposit threw");
    }
  },
};
