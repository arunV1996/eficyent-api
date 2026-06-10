import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
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
 * Caliza integration routed via Processing Unit.
 *
 * Auth: Signed using Processing Unit credentials (x-api-key, x-api-signature, etc.).
 * Endpoints:
 *   POST /api/v1/onboard                  - create user
 *   POST /api/v1/create-virtual-account   - create VA
 */

interface PUSecret extends Record<string, unknown> {
  URL: string;
  API_KEY: string;
  API_SECRET: string;
  TIMEOUT_SEC?: number;
}

let cachedSecret: PUSecret | null = null;
async function loadSecret(): Promise<PUSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<PUSecret>("processingunit");
  return cachedSecret;
}

function signRequest(secret: PUSecret, endpoint: string, bodyJson: string) {
  const apiKey = secret.API_KEY;
  const apiSecret = secret.API_SECRET;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  const segments = endpoint.split("/").filter(Boolean);
  const endpointForSignature = "/" + (segments[segments.length - 1] || "");

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

interface CalizaResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  code: number;
  url: string;
  payload: any;
  responseBody: any;
}

async function callJSON<T>(
  method: "GET" | "POST",
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<CalizaResponse<T>> {
  const secret = await loadSecret();

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
      signRequest: async (signCtx) => {
        const sig = signRequest(secret, endpoint, signCtx.bodyJson);
        signCtx.headers["x-api-key"] = sig.apiKey;
        signCtx.headers["x-api-timestamp"] = sig.timestamp;
        signCtx.headers["x-nonce"] = sig.nonce;
        signCtx.headers["x-api-signature"] = sig.signature;
      },
      timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
    },
  );

  return {
    success: res.body?.success === true,
    message: res.body?.message ?? "",
    data: (res.body?.data ?? null) as T | null,
    code: res.status,
    url: `${secret.URL.replace(/\/$/, "")}${endpoint}`,
    payload,
    responseBody: res.body,
  };
}

async function getAlpha2Code(alpha3Code: string | null): Promise<string> {
  if (!alpha3Code) return "";
  const code = await prisma().mobileCountryCode.findFirst({
    where: { alpha3Code },
  });
  return code ? code.alpha2Code : alpha3Code;
}

async function normalizeState(state: string | null): Promise<string> {
  if (!state) return "";
  const trimmed = state.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const stateDetail = await prisma().state.findFirst({
    where: { stateCode: { contains: trimmed } },
  });
  return stateDetail ? stateDetail.countryCode : trimmed;
}

async function buildOnboardingPayload(user: User): Promise<Record<string, unknown>> {
  const info = await prisma().userInformation.findFirst({
    where: { userId: user.id },
  });

  const mobile = user.mobileCountryCode && user.mobile 
    ? `+${user.mobileCountryCode}${user.mobile}` 
    : (user.mobile || "");

  const dobFormatted = user.dob 
    ? user.dob.toISOString().split("T")[0] 
    : null;

  if (Number(user.userType) === USER_TYPE_INDIVIDUAL) {
    const countryCode = info?.country ? await getAlpha2Code(info.country) : "";
    const stateNormalized = info?.state ? await normalizeState(info.state) : "";

    return {
      integratorBeneficiaryId: user.uniqueId,
      user_type: Number(user.userType),
      first_name: user.firstName ?? "",
      last_name: user.lastName ?? "",
      email: user.email,
      mobile,
      dob: dobFormatted,
      address_1: info?.address1 ?? "",
      address_2: info?.address2 ?? "",
      city: info?.city ?? "",
      state: stateNormalized,
      zipcode: info?.postalCode ?? "",
      country: countryCode,
      citizenship: countryCode,
      id_number: info?.idNumber ?? "",
    };
  } else {
    const countryCode = info?.country ? await getAlpha2Code(info.country) : "";
    const stateNormalized = info?.state ? await normalizeState(info.state) : "";

    const payload: Record<string, any> = {
      integratorBeneficiaryId: user.uniqueId,
      user_type: Number(user.userType),
      business_name: info?.businessName ?? "",
      formation_date: info?.formationDate ? info.formationDate.toISOString().split("T")[0] : "",
      tax_id: info?.taxId ?? "",
      mobile,
      email: user.email,
      website: info?.website ?? "",
      address_1: info?.address1 ?? "",
      address_2: info?.address2 ?? "",
      city: info?.city ?? "",
      state: stateNormalized,
      zipcode: info?.postalCode ?? "",
      country: countryCode,
    };

    const businessPersons = info?.businessPersons as any[];
    if (Array.isArray(businessPersons)) {
      payload.business = { contacts: [] };
      for (const contact of businessPersons) {
        const contactCountry = contact.country ? await getAlpha2Code(contact.country) : "";
        const contactState = contact.state ? await normalizeState(contact.state) : "";
        const contactMobile = contact.mobile_country_code && contact.mobile 
          ? `+${contact.mobile_country_code}${contact.mobile}` 
          : (contact.mobile || "");

        payload.business.contacts.push({
          first_name: contact.first_name ?? "",
          last_name: contact.last_name ?? "",
          dob: contact.dob ?? "",
          email: contact.email ?? "",
          mobile: contactMobile,
          id_number: contact.id_number ?? "",
          address_1: contact.address_1 ?? "",
          address_2: contact.address_2 ?? "",
          city: contact.city ?? "",
          state: contactState,
          zipcode: contact.postal_code ?? "",
          country: contactCountry,
          citizenship: contactCountry,
          profession: contact.profession ?? "",
        });
      }
    }

    return payload;
  }
}

function writeECLog(userUniqueId: string, folderName: string, step: string, data: unknown): void {
  try {
    const dir = path.join(__dirname, "..", "..", "..", "logs", folderName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, `${userUniqueId}.log`);
    const timestamp = new Date().toISOString();
    const jsonStr = JSON.stringify(
      data,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    );
    const logMessage = `[${timestamp}] [${step}]\n${jsonStr}\n\n`;
    fs.appendFileSync(filePath, logMessage, "utf8");
  } catch (err) {
    logger.error({ err }, "Failed to write EC log");
  }
}

export const Caliza = {
  /**
   * Creates the user on Caliza via Processing Unit, persists
   * the returned user_id on user_services, and on success
   * marks the row CREATED (else FAILED).
   */
  async onboard(user: User): Promise<void> {
    try {
      // Ensure a UserService row exists in INITIATED state up-front; the
      // onboarding factory may also have done this from Phase 3, so we
      // upsert idempotently.
      let initialUserService;
      const userServiceRecord = await prisma().userService.findFirst({
        where: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA },
      });
      if (userServiceRecord) {
        initialUserService = await prisma().userService.update({
          where: { id: userServiceRecord.id },
          data: {
            status: ONBOARDING_STATUS_INITIATED,
          },
        });
      } else {
        initialUserService = await prisma().userService.create({
          data: {
            uniqueId: uniqueId(24),
            userId: user.id,
            serviceType: EXTERNAL_TYPE_CALIZA,
            status: ONBOARDING_STATUS_INITIATED,
            isActive: 1,
          },
        });
      }

      const response = await callJSON<{ user_id?: string }>(
        "POST",
        "/api/v1/onboard",
        await buildOnboardingPayload(user),
        {
          callFor: "create",
          referenceType: "App\\Models\\User",
          referenceId: user.id,
        },
      );

      writeECLog(user.uniqueId, "EC-Virtual-Account", "ONBOARD_API_DETAILS", {
        url: response.url,
        payload: response.payload,
        response: response.responseBody,
      });

      if (!response.success || !response.data?.user_id) {
        await prisma().userService.update({
          where: { id: initialUserService.id },
          data: {
            status: ONBOARDING_STATUS_FAILED,
          },
        });

        logger.warn(
          { userId: user.id.toString(), msg: response.message },
          "Caliza onboarding rejected",
        );
        return;
      }

      await prisma().userService.update({
        where: { id: initialUserService.id },
        data: {
          status: ONBOARDING_STATUS_CREATED,
          externalReferenceId: response.data.user_id,
          externalData: response.data as never,
        },
      });
    } catch (err) {
      logger.error({ err, userId: user.id.toString() }, "Caliza onboard threw");
      const userServiceRecord = await prisma().userService.findFirst({
        where: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA },
      });
      if (userServiceRecord) {
        await prisma()
          .userService.update({
            where: { id: userServiceRecord.id },
            data: {
              status: ONBOARDING_STATUS_FAILED,
            },
          })
          .catch(() => undefined);
      }
    }
  },

  /**
   * Creates a virtual account on Caliza via Processing Unit for the onboarded user;
   * details typically arrive asynchronously via webhook.
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

      // Anchor row in PENDING; the webhook flips to CREATED when Processing Unit
      // returns the actual account details.
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

      const payload = {
        user_id: userService.externalReferenceId,
      };

      const response = await callJSON<Record<string, unknown>>(
        "POST",
        "/api/v1/create-virtual-account",
        payload,
        {
          callFor: "create",
          referenceType: "App\\Models\\VirtualAccount",
          referenceId: va.id,
        },
      );

      writeECLog(user.uniqueId, "EC-Virtual-Account", "CREATE_VIRTUAL_ACCOUNT", {
        url: response.url,
        payload: response.payload,
        response: response.responseBody,
      });

      if (!response.success) {
        await prisma().virtualAccount.update({
          where: { id: va.id },
          data: { status: VIRTUAL_ACCOUNT_STATUS_FAILED },
        });
        return;
      }

      // The webhook is the source of truth for the final account fields;
      // we only flip to CREATED here if the Processing Unit synchronous response
      // includes the account number (usually data is null).
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

  /**
   * Creates a beneficiary account on Caliza via Processing Unit.
   */
  async createBeneficiary(beneficiary: any, details: any, userUniqueId: string): Promise<void> {
    try {
      const bankCountryCode = await getAlpha2Code(beneficiary.bankCountry || beneficiary.country);
      const recipientCountryCode = await getAlpha2Code(details?.country || beneficiary.country);

      const payload: any = {
        beneficiary_type: beneficiary.type ?? 1,
        type: beneficiary.paymentRail ?? "ACH",
        currency: beneficiary.currency ?? "USD",
        details: {
          bankName: beneficiary.bankName ?? "",
          bankCountry: bankCountryCode || "US",
          accountType: beneficiary.accountType ?? "Checking",
          routingNumber: beneficiary.routingNumber ?? "",
          accountNumber: beneficiary.accountNumber ?? "",
          recipientAddress: {
            street1: details?.addressLine1 ?? "",
            street2: details?.addressLine2 ?? "",
            postalCode: details?.postalCode ?? "",
            city: details?.city ?? "",
            state: details?.state ?? "",
            country: recipientCountryCode || "US",
          },
        },
      };

      if (beneficiary.type === 2) {
        payload.businessName = beneficiary.businessName || beneficiary.accountName || "";
      } else {
        payload.individualName = beneficiary.accountName || `${beneficiary.firstName ?? ""} ${beneficiary.lastName ?? ""}`.trim();
      }

      const response = await callJSON<{ id?: string }>(
        "POST",
        "/api/v1/create-beneficiary",
        payload,
        {
          callFor: "create",
          referenceType: "App\\Models\\BeneficiaryAccount",
          referenceId: beneficiary.id,
        },
      );

      writeECLog(userUniqueId, "EC-Beneficiary-Accounts", "CREATE_BENEFICIARY", {
        url: response.url,
        payload: response.payload,
        response: response.responseBody,
      });

      if (response.success && response.data?.id) {
        await prisma().beneficiaryAccount.update({
          where: { id: beneficiary.id },
          data: {
            externalType: EXTERNAL_TYPE_CALIZA,
            externalReferenceId: response.data.id,
            externalData: response.data as never,
          },
        });
      }
    } catch (err) {
      logger.error(
        { err, beneficiaryId: beneficiary.id.toString() },
        "Caliza createBeneficiary threw",
      );
    }
  },
};
