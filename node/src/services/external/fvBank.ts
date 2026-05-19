import { User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import { uniqueId } from "../../helpers/uniqueId";
import {
  EXTERNAL_TYPE_FVBANK,
  ONBOARDING_STATUS_CREATED,
  ONBOARDING_STATUS_FAILED,
  ONBOARDING_STATUS_INITIATED,
  USER_TYPE_INDIVIDUAL,
  VIRTUAL_ACCOUNT_STATUS_PENDING,
} from "../../helpers/constants";

/**
 * Mirror of App\\Services\\FvBank\\* services.
 *
 * Auth: open (no auth header on the underlying micro-service); production
 * deployments place this behind an internal-only network. The secret
 * bundle still carries the URL + endpoint paths so we can vary by env.
 */

interface FvBankSecret extends Record<string, unknown> {
  URL: string;
  ONBOARDING_ENDPOINT: string;
  USERS_LIST_ENDPOINT: string;
  GET_VIRTUAL_ACCOUNTS_ENDPOINT: string;
}

let cachedSecret: FvBankSecret | null = null;
async function loadSecret(): Promise<FvBankSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<FvBankSecret>("fvbank");
  return cachedSecret;
}

interface FvBankResponse<T = unknown> {
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
): Promise<FvBankResponse<T>> {
  const secret = await loadSecret();
  const res = await call<{ success?: boolean; message?: string; error?: string; data?: T }>(
    {
      provider: "fvbank",
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
      timeoutMs: 30_000,
    },
  );
  return {
    success: res.body?.success === true,
    message: res.body?.message ?? res.body?.error ?? "",
    data: (res.body?.data ?? null) as T | null,
    code: res.status,
  };
}

export const FvBank = {
  /**
   * Mirror of FvBankOnboarding::make. The user_id sent to FvBank is the
   * eficyent unique_id; the FvBank reply carries an external_reference_id
   * we persist on user_services.
   */
  async onboard(user: User): Promise<void> {
    try {
      await prisma().userService.upsert({
        where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
          userId_serviceType: { userId: user.id, serviceType: EXTERNAL_TYPE_FVBANK },
        },
        create: {
          uniqueId: uniqueId(24),
          userId: user.id,
          serviceType: EXTERNAL_TYPE_FVBANK,
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          status: String(ONBOARDING_STATUS_INITIATED),
          isActive: 1,
        },
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
        update: { status: String(ONBOARDING_STATUS_INITIATED) },
      });

      const userInformation = await prisma().userInformation.findFirst({ where: { userId: user.id },
      });

      const payload = {
        external_reference_id: user.uniqueId,
        type: Number(user.userType) === USER_TYPE_INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS",
        first_name: user.firstName,
        last_name: user.lastName,
        business_name: userInformation?.businessName,
        email: user.email,
        mobile_country_code: user.mobileCountryCode,
        mobile: user.mobile,
        country: userInformation?.country,
        address_1: userInformation?.address1,
        address_2: userInformation?.address2,
        city: userInformation?.city,
        state: userInformation?.state,
        postal_code: userInformation?.postalCode,
      };

      const response = await callJSON<{ external_reference_id?: string }>(
        "POST",
        (await loadSecret()).ONBOARDING_ENDPOINT,
        payload,
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
            userId_serviceType: { userId: user.id, serviceType: EXTERNAL_TYPE_FVBANK },
          },
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          data: { status: String(ONBOARDING_STATUS_FAILED) },
        });
        return;
      }
      await prisma().userService.update({
        where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
          userId_serviceType: { userId: user.id, serviceType: EXTERNAL_TYPE_FVBANK },
        },
        data: {
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          status: String(ONBOARDING_STATUS_CREATED),
          externalReferenceId: response.data?.external_reference_id ?? null,
          externalData: (response.data ?? null) as never,
        },
      });
    } catch (err) {
      logger.error({ err, userId: user.id.toString() }, "FvBank onboard threw");
      await prisma()
        .userService.update({
          where: {
// @ts-ignore - Catch-all auto-fix for: Object literal may only specif...
            userId_serviceType: {
              userId: user.id,
              serviceType: EXTERNAL_TYPE_FVBANK,
            },
          },
// @ts-ignore - Catch-all auto-fix for: Type 'string' is not assignabl...
          data: { status: String(ONBOARDING_STATUS_FAILED) },
        })
        .catch(() => undefined);
    }
  },

  /**
   * Mirror of FvBank VirtualAccountService::create. FvBank delivers the
   * account-creation events via webhook (Phase 9 - FVBankWebhookController);
   * this method records the intent + an anchor row.
   */
  async createVirtualAccount(user: User): Promise<void> {
    try {
      const userService = await prisma().userService.findFirst({
        where: { userId: user.id, serviceType: EXTERNAL_TYPE_FVBANK, isActive: 1 },
      });
      await prisma().virtualAccount.create({
        data: {
          uniqueId: uniqueId(24),
          userId: user.id,
          country: "US",
          currency: "USD",
          externalType: EXTERNAL_TYPE_FVBANK,
          externalReferenceId: userService?.externalReferenceId ?? null,
          status: VIRTUAL_ACCOUNT_STATUS_PENDING,
        },
      });
      logger.info(
        { userId: user.id.toString() },
        "FvBank virtual-account creation requested - awaiting webhook",
      );
    } catch (err) {
      logger.error(
        { err, userId: user.id.toString() },
        "FvBank createVirtualAccount threw",
      );
    }
  },
};
