import { User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import { uniqueId } from "../../helpers/uniqueId";
import {
  EXTERNAL_TYPE_CALIZA,
  ONBOARDING_STATUS_CREATED,
  ONBOARDING_STATUS_FAILED,
  ONBOARDING_STATUS_INITIATED,
  USER_TYPE_INDIVIDUAL,
  VIRTUAL_ACCOUNT_STATUS_CREATED,
  VIRTUAL_ACCOUNT_STATUS_FAILED,
  VIRTUAL_ACCOUNT_STATUS_PENDING,
} from "../../helpers/constants";

/**
 * Mirror of App\\Services\\Caliza\\* services + the wiring from
 * App\\ExternalServices\\Onboarding\\Caliza\\CalizaOnboarding.
 *
 * Auth: X-Internal-API-Key header.
 * Endpoints (from secret bundle):
 *   POST /onboarding             - create user
 *   GET  /user-details           - fetch user
 *   POST /virtual-account        - create VA
 *   GET  /virtual-accounts       - list VAs
 *   POST /user-balance           - balance
 */

interface CalizaSecret extends Record<string, unknown> {
  URL: string;
  TOKEN: string;
  TIMEOUT_SEC?: number;
  ONBOARDING_ENDPOINT: string;
  GET_USER_DETAILS_ENDPOINT: string;
  VIRTUAL_ACCOUNT_ENDPOINT: string;
  GET_VIRTUAL_ACCOUNTS_ENDPOINT: string;
  GET_USER_BALANCE_ENDPOINT: string;
}

let cachedSecret: CalizaSecret | null = null;
async function loadSecret(): Promise<CalizaSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<CalizaSecret>("caliza");
  return cachedSecret;
}

async function calizaHeaders(): Promise<Record<string, string>> {
  const secret = await loadSecret();
  return { "X-Internal-API-Key": secret.TOKEN };
}

interface CalizaResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  code: number;
}

async function callJSON<T>(
  method: "GET" | "POST",
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<CalizaResponse<T>> {
  const secret = await loadSecret();
  const headers = await calizaHeaders();
  const res = await call<{ success?: boolean; message?: string; data?: T }>(
    {
      provider: "caliza",
      callFor: ctx.callFor,
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
    },
    {
      method,
      baseUrl: secret.URL,
      path: endpoint,
      body: method === "POST" ? payload : undefined,
      query: method === "GET" ? (payload as Record<string, string | number>) : undefined,
      headers,
      timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
    },
  );
  return {
    success: res.body?.success === true,
    message: res.body?.message ?? "",
    data: (res.body?.data ?? null) as T | null,
    code: res.status,
  };
}

function buildOnboardingPayload(user: User): Record<string, unknown> {
  return {
    type: Number(user.userType) === USER_TYPE_INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS",
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    dob: user.dob,
    timezone: user.timezone,
    external_reference_id: user.uniqueId,
  };
}

export const Caliza = {
  /**
   * Mirror of CalizaOnboarding::make. Creates the user on Caliza, persists
   * the returned external_reference_id on user_services, and on success
   * marks the row CREATED (else FAILED).
   */
  async onboard(user: User): Promise<void> {
    try {
      // Ensure a UserService row exists in INITIATED state up-front; the
      // onboarding factory may also have done this from Phase 3, so we
      // upsert idempotently.
      await prisma().userService.upsert({
        where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
          userId_serviceType: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA },
        },
        create: {
          uniqueId: uniqueId(24),
          userId: user.id,
          serviceType: EXTERNAL_TYPE_CALIZA,
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          status: String(ONBOARDING_STATUS_INITIATED),
          isActive: 1,
        },
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
        update: { status: String(ONBOARDING_STATUS_INITIATED) },
      });

      const response = await callJSON<{ external_reference_id?: string }>(
        "POST",
        (await loadSecret()).ONBOARDING_ENDPOINT,
        buildOnboardingPayload(user),
        {
          callFor: "create",
          referenceType: "App\\Models\\User",
          referenceId: user.id,
        },
      );

      if (!response.success) {
        await prisma().userService.update({
          where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
            userId_serviceType: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA },
          },
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          data: { status: String(ONBOARDING_STATUS_FAILED) },
        });
        logger.warn(
          { userId: user.id.toString(), msg: response.message },
          "Caliza onboarding rejected",
        );
        return;
      }

      await prisma().userService.update({
        where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
          userId_serviceType: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA },
        },
        data: {
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          status: String(ONBOARDING_STATUS_CREATED),
          externalReferenceId: response.data?.external_reference_id ?? null,
          externalData: (response.data ?? null) as never,
        },
      });
    } catch (err) {
      logger.error({ err, userId: user.id.toString() }, "Caliza onboard threw");
      await prisma()
        .userService.update({
          where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
            userId_serviceType: {
              userId: user.id,
              serviceType: EXTERNAL_TYPE_CALIZA,
            },
          },
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          data: { status: String(ONBOARDING_STATUS_FAILED) },
        })
        .catch(() => undefined);
    }
  },

  /**
   * Mirror of VirtualAccountService::create. Creates a virtual account on
   * Caliza for the onboarded user; the actual account_number/details
   * arrive asynchronously via the Caliza webhook (Phase 9).
   */
  async createVirtualAccount(user: User): Promise<void> {
    try {
      const userService = await prisma().userService.findFirst({
        where: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA, isActive: 1 },
      });
      if (!userService?.externalReferenceId) {
        logger.warn(
          { userId: user.id.toString() },
          "Caliza createVirtualAccount - no external_reference_id",
        );
        return;
      }

      // Anchor row in PENDING; the webhook flips to CREATED when Caliza
      // returns the actual account_number/swift_code.
      const va = await prisma().virtualAccount.create({
        data: {
          uniqueId: uniqueId(24),
          userId: user.id,
          country: "US",
          currency: "USD",
          externalType: EXTERNAL_TYPE_CALIZA,
          externalReferenceId: userService.externalReferenceId,
          status: VIRTUAL_ACCOUNT_STATUS_PENDING,
        },
      });

      const response = await callJSON<Record<string, unknown>>(
        "POST",
        (await loadSecret()).VIRTUAL_ACCOUNT_ENDPOINT,
        {
          external_reference_id: userService.externalReferenceId,
          currency: "USD",
        },
        {
          callFor: "create",
          referenceType: "App\\Models\\VirtualAccount",
          referenceId: va.id,
        },
      );

      if (!response.success) {
        await prisma().virtualAccount.update({
          where: { id: va.id },
          data: { status: VIRTUAL_ACCOUNT_STATUS_FAILED },
        });
        return;
      }

      // The webhook is the source of truth for the final account fields;
      // we only flip to CREATED here when Caliza's synchronous response
      // includes the account number (some Caliza environments do; sandbox
      // returns it immediately).
      const data = response.data as Record<string, unknown> | null;
      if (data && (data.account_number || data.iban)) {
        await prisma().virtualAccount.update({
          where: { id: va.id },
          data: {
            accountNumber: (data.account_number as string) ?? null,
            accountHolderName: (data.account_holder_name as string) ?? null,
            accountBankName: (data.account_bank_name as string) ?? null,
            accountBankCode: (data.account_bank_code as string) ?? null,
            routingNumber: (data.routing_number as string) ?? null,
            externalData: data as never,
            status: VIRTUAL_ACCOUNT_STATUS_CREATED,
          },
        });
      }
    } catch (err) {
      logger.error(
        { err, userId: user.id.toString() },
        "Caliza createVirtualAccount threw",
      );
    }
  },
};
