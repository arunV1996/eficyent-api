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
  EXTERNAL_TYPE_COMPLIANCE,
  USER_TYPE_BUSINESS,
  COMPLIANCE_ACCOUNT_TYPE_MAP,
  COMPLIANCE_ID_TYPE_MAP,
  COMPLIANCE_SOURCE_OF_FUNDS_MAP,
  COMPLIANCE_PURPOSE_OF_PAYMENT_MAP,
} from "../../helpers/constants";
import { uniqueId } from "../../helpers/uniqueId";
import { format_processing_unit_fx_rate } from "../../helpers/lookups";
import { lookupsService } from "../lookups/lookupsService";

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
    { provider: EXTERNAL_TYPE_COMPLIANCE, callFor: "create" },
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
      provider: EXTERNAL_TYPE_COMPLIANCE,
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
        externalType: EXTERNAL_TYPE_COMPLIANCE,
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

// Helper Mappings
async function getAlpha2Code(alpha3Code: string | null | undefined): Promise<string> {
  if (!alpha3Code) return "";
  const code = await prisma().mobileCountryCode.findFirst({
    where: { alpha3Code },
  });
  return code ? code.alpha2Code : alpha3Code;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    const parts = d.toISOString().split("T");
    return parts[0] ?? "";
  } catch {
    return "";
  }
}

function getMappedValue(map: Record<string, string>, value: string, type: string, defaultValue = ""): string {
  const normalizedValue = value.toUpperCase().trim();
  if (map[normalizedValue]) {
    return map[normalizedValue];
  }
  logger.warn({ type, value }, "Compliance mapping missing");
  return defaultValue || "OTHERS";
}

function mapAccountType(value: string | null | undefined): string {
  if (!value) return "OTHER";
  return getMappedValue(COMPLIANCE_ACCOUNT_TYPE_MAP, value, "Account Type", "OTHER");
}

function mapIdType(value: string | null | undefined): string {
  if (!value) return "OTHERS";
  return getMappedValue(COMPLIANCE_ID_TYPE_MAP, value, "ID_TYPE", "OTHERS");
}

function mapSourceOfFunds(value: string | null | undefined): string {
  if (!value) return "OTHER";
  return getMappedValue(COMPLIANCE_SOURCE_OF_FUNDS_MAP, value, "SOURCE_OF_FUNDS", "OTHER");
}

function mapPurposeOfPayment(value: string | null | undefined): string {
  if (!value) return "OTHER";
  return getMappedValue(COMPLIANCE_PURPOSE_OF_PAYMENT_MAP, value, "PURPOSE_OF_PAYMENT", "OTHER");
}

function removeEmptyValues(data: any): any {
  if (data === null || data === undefined || data === '') {
    return undefined;
  }
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      const cleanedArr = data
        .map(removeEmptyValues)
        .filter(v => v !== undefined && v !== null && v !== '');
      return cleanedArr.length > 0 ? cleanedArr : undefined;
    } else {
      const res: Record<string, any> = {};
      for (const [key, val] of Object.entries(data)) {
        if (key === "metadata") {
          res[key] = val;
          continue;
        }
        const cleaned = removeEmptyValues(val);
        if (cleaned !== undefined && cleaned !== null && cleaned !== '') {
          res[key] = cleaned;
        }
      }
      return Object.keys(res).length > 0 ? res : undefined;
    }
  }
  return data;
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
      const quote = await prisma().quote.findUnique({
        where: { id: txn.quoteId }
      });
      if (!quote) {
        throw new Error("Compliance.make - Quote not found");
      }

      const beneficiaryAccount = await prisma().beneficiaryAccount.findUnique({
        where: { id: txn.beneficiaryAccountId },
        include: { additionalDetails: true }
      });
      if (!beneficiaryAccount) {
        throw new Error("Compliance.make - BeneficiaryAccount not found");
      }
      const beneficiaryAdditionalDetail = beneficiaryAccount.additionalDetails?.[0] || null;

      const sender = txn.senderId
        ? await prisma().sender.findUnique({ where: { id: txn.senderId } })
        : null;

      let ownerUser = user;
      let merchant = null;
      if (user.merchantId) {
        merchant = await prisma().merchant.findUnique({
          where: { id: user.merchantId },
          include: { users_merchants_user_idTousers: true }
        });
        if (merchant) {
          const owner = await prisma().user.findUnique({ where: { id: merchant.userId } });
          if (owner) {
            ownerUser = owner;
          }
        }
      }

      let userInformation = await prisma().userInformation.findFirst({
        where: { userId: ownerUser.id }
      });
      if (!userInformation || (!userInformation.idNumber && !userInformation.idType)) {
        const initiatorUserInfo = await prisma().userInformation.findFirst({
          where: { userId: user.id }
        });
        if (initiatorUserInfo && (initiatorUserInfo.idNumber || initiatorUserInfo.idType)) {
          userInformation = initiatorUserInfo;
        }
      }

      let secret: ComplianceSecret;
      try {
        secret = await loadSecret();
        endpoint = secret.CREATE_TRANSACTION_ENDPOINT;
      } catch (err) {
        const errorMsg = `Failed to load compliance secrets: ${err instanceof Error ? err.message : String(err)}`;
        await recordFailedInitiation(txn.id, "load_secrets", errorMsg, startTime);
        throw err;
      }

      let senderType = "INDIVIDUAL";
      let senderName = "";

      if (sender) {
        senderType = Number(sender.type) === USER_TYPE_BUSINESS ? "BUSINESS" : "INDIVIDUAL";
        senderName = `${sender.firstName || ""} ${sender.lastName || ""}`.trim();
      } else {
        senderType = Number(ownerUser.userType) === USER_TYPE_BUSINESS ? "BUSINESS" : "INDIVIDUAL";
        senderName = Number(ownerUser.userType) === USER_TYPE_BUSINESS
          ? (merchant ? merchant.name : (userInformation?.businessName ?? ""))
          : `${ownerUser.firstName || ""} ${ownerUser.lastName || ""}`.trim();
      }

      let sourceCountry: string | null = null;
      let sourceCurrency = "USD";
      if (quote.sourceId && quote.sourceType) {
        if (quote.sourceType.includes("VirtualAccount")) {
          const va = await prisma().virtualAccount.findUnique({
            where: { id: quote.sourceId }
          });
          sourceCountry = va?.country ?? null;
          sourceCurrency = va?.currency ?? "USD";
        } else if (quote.sourceType.includes("Wallet")) {
          const wallet = await prisma().wallet.findUnique({
            where: { id: quote.sourceId }
          });
          sourceCurrency = wallet?.currency ?? "USD";
        }
      }

      // Replicate the Laravel logic: combine source country and destination country codes.
      // If sourceCountry (from virtualAccount) is null, fall back to originator country.
      const fromCountryRaw = sourceCountry || (sender ? sender.country : userInformation?.country) || null;
      const fromCountry = fromCountryRaw ? await getAlpha2Code(fromCountryRaw) : "";
      const toCountry = quote.recipientCountry ? await getAlpha2Code(quote.recipientCountry) : "";
      const corridor = (fromCountry && toCountry) ? `${fromCountry}-${toCountry}` : null;

      let idTypeRaw = "";
      if (sender) {
        idTypeRaw = sender.idType
          ? await lookupsService.findValuebyKey(sender.idType, "id_types")
          : "";
      } else {
        idTypeRaw = userInformation?.idType
          ? await lookupsService.findValuebyKey(userInformation.idType, "id_types")
          : "";
      }
      const idTypeMapped = mapIdType(idTypeRaw);

      const dobString = sender
        ? (sender.dob ? formatDate(sender.dob) : "")
        : (ownerUser.dob ? formatDate(ownerUser.dob) : "");

      // Replicate the Laravel logic hierarchy: $user->merchant ? $user->merchant->user->compliance_merchant_id : $user->compliance_merchant_id
      const complianceMerchantId = user.merchantId
        ? (merchant?.users_merchants_user_idTousers?.complianceMerchantId ?? null)
        : (user.complianceMerchantId ?? null);

      const beneficiaryType = Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS ? "BUSINESS" : "INDIVIDUAL";
      const beneficiaryFullName = Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
        ? (beneficiaryAccount.businessName ?? "")
        : `${beneficiaryAccount.firstName || ""} ${beneficiaryAccount.lastName || ""}`.trim();

      const payloadObj: Record<string, any> = {
        externalId: txn.orderId ? String(txn.orderId) : "",
        merchantId: complianceMerchantId,
        transaction_type: "REMITTANCE",
        transactionSubtype: "INTERNATIONAL",
        direction: "OUTBOUND",
        originator: {
          partyId: sender ? sender.uniqueId : ownerUser.uniqueId,
          externalId: sender ? sender.uniqueId : ownerUser.uniqueId,
          partyType: senderType,
          fullName: senderName,
          firstName: sender
            ? (sender.firstName ?? "")
            : (Number(ownerUser.userType) === USER_TYPE_BUSINESS ? (merchant ? merchant.name : (userInformation?.businessName ?? "")) : (ownerUser.firstName ?? "")),
          middleName: sender
            ? (sender.middleName ?? "")
            : (Number(ownerUser.userType) === USER_TYPE_BUSINESS ? "" : (ownerUser.middleName ?? "")),
          // Include originator.lastName even for business entities where applicable
          lastName: sender
            ? (sender.lastName ?? "")
            : (ownerUser.lastName || user.lastName || ""),
          dateOfBirth: dobString,
          nationality: sender
            ? (sender.nationality ?? "")
            : (userInformation?.country ?? ""),
          countryOfResidence: sender
            ? (sender.country ?? "")
            : (userInformation?.country ?? ""),
          address: {
            streetLine1: sender
              ? (sender.address1 ?? "")
              : (userInformation?.address1 ?? ""),
            streetLine2: sender
              ? (sender.address2 ?? "")
              : (userInformation?.address2 ?? ""),
            city: sender
              ? (sender.city ?? "")
              : (userInformation?.city ?? ""),
            state: sender
              ? (sender.state ?? "")
              : (userInformation?.state ?? ""),
            postalCode: sender
              ? (sender.postalCode ?? "")
              : (userInformation?.postalCode ?? ""),
            country: sender
              ? (sender.country ?? "")
              : (userInformation?.country ?? ""),
          },
          identification: {
            type: idTypeMapped,
            // Include originator.identification.number with fallback to taxId for business entities
            number: sender
              ? (sender.idNumber ?? "")
              : (userInformation?.idNumber || userInformation?.taxId || ""),
            issuingCountry: "",
          },
          phone: {
            countryCode: sender
              ? (sender.mobileCountryCode ?? "")
              : (ownerUser.mobileCountryCode ?? ""),
            number: sender
              ? (sender.mobile ?? "")
              : (ownerUser.mobile ?? ""),
          },
          email: sender
            ? (sender.email ?? "")
            : (merchant ? merchant.email : (ownerUser.email ?? "")),
          occupation: "",
          employer: "",
        },
        beneficiary: {
          partyType: beneficiaryType,
          fullName: beneficiaryFullName,
          firstName: Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
            ? (beneficiaryAccount.businessName ?? "")
            : (beneficiaryAccount.firstName ?? ""),
          middleName: Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
            ? ""
            : (beneficiaryAccount.middleName ?? ""),
          lastName: Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
            ? ""
            : (beneficiaryAccount.lastName ?? ""),
          dateOfBirth: "",
          relationshipToRemitter: "CLIENT",
          address: {
            streetLine1: beneficiaryAdditionalDetail?.addressLine1 ?? "",
            city: beneficiaryAdditionalDetail?.city ?? "",
            state: beneficiaryAdditionalDetail?.state ?? "",
            country: beneficiaryAdditionalDetail?.country ?? "",
          },
          phone: {
            countryCode: beneficiaryAccount.mobileCountryCode ?? ownerUser.mobileCountryCode ?? "",
            number: beneficiaryAccount.mobile ?? ownerUser.mobile ?? "",
          },
          bankDetails: {
            bankName: beneficiaryAccount.bankName ?? "",
            bankCode: beneficiaryAccount.swiftCode ?? "",
            branchName: "",
            branchCode: "",
            routingNumber: beneficiaryAccount.routingNumber ?? "",
            iban: "",
            accountNumber: beneficiaryAccount.accountNumber ?? "",
            accountType: mapAccountType(beneficiaryAccount.accountType),
            accountCurrency: beneficiaryAccount.currency ?? "",
          },
          bankName: beneficiaryAccount.bankName ?? "",
          bankCode: beneficiaryAccount.swiftCode ?? "",
          accountNumber: beneficiaryAccount.accountNumber ?? "",
          accountType: mapAccountType(beneficiaryAccount.accountType),
          walletDetails: {
            provider: "M-Pesa",
            walletId: "string",
            accountName: "string",
          },
          pickupDetails: {
            agentNetwork: "",
            pickupLocation: "",
            pickupCountry: "",
            pickupCity: "",
            securityQuestion: "",
            securityAnswer: "",
          },
        },
        amount: Number(txn.amount),
        currency: sourceCurrency,
        amountUsd: Number(txn.amount),
        destinationAmount: Number(txn.recipientAmount),
        destinationCurrency: txn.receivingCurrency ?? "",
        exchangeRate: Number(format_processing_unit_fx_rate(quote.fxRate)),
        paymentMethod: (txn.receivingCurrency ?? "") !== "USD"
          ? "BANK_TRANSFER"
          : (beneficiaryAccount.paymentRail
              ? String(beneficiaryAccount.paymentRail).toUpperCase()
              : "BANK_TRANSFER"),
        payoutMethod: "BANK_DEPOSIT",
        sourceOfFunds: "",
        purposeOfPayment: "",
        originatorCountry: sender ? (sender.country ?? "") : (userInformation?.country ?? ""),
        beneficiaryCountry: beneficiaryAccount.country ?? "",
        corridor,
        fees: {
          serviceFee: 0,
          fxFee: 0,
          totalFee: Number(txn.commissionAmount),
          feeCurrency: "USD",
        },
        agent: {
          agentId: "",
          agentName: "",
          agentLocation: "",
        },
        isExternalClient: 1,
        externalClient: {
          id: String(secret.EXTERNAL_CLIENT_ID ?? secret.EXTERNALCLIENTID ?? process.env.EXTERNAL_CLIENT_ID ?? ""),
          name: String(secret.EXTERNAL_CLIENT_NAME ?? secret.EXTERNALCLIENTNAME ?? process.env.EXTERNAL_CLIENT_NAME ?? ""),
          code: String(secret.EXTERNAL_CLIENT_CODE ?? secret.EXTERNALCLIENTCODE ?? process.env.EXTERNAL_CLIENT_CODE ?? ""),
        },
        metadata: {},
      };

      // Resolve sourceOfFunds lookup
      let sourceOfFundsRaw = "";
      if (sender) {
        sourceOfFundsRaw = sender.sourceOfFunds
          ? await lookupsService.findValuebyKey(sender.sourceOfFunds)
          : "";
      } else {
        sourceOfFundsRaw = userInformation?.sourceOfIncome
          ? await lookupsService.findValuebyKey(userInformation.sourceOfIncome)
          : "";
      }
      payloadObj.sourceOfFunds = mapSourceOfFunds(sourceOfFundsRaw);

      // Resolve purposeOfPayment lookup
      let purposeOfPaymentRaw = "";
      if (beneficiaryAdditionalDetail?.purposeOfTransaction) {
        purposeOfPaymentRaw = await lookupsService.findValuebyKey(beneficiaryAdditionalDetail.purposeOfTransaction);
      }
      payloadObj.purposeOfPayment = mapPurposeOfPayment(purposeOfPaymentRaw);

      payload = removeEmptyValues(payloadObj);

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
            externalType: EXTERNAL_TYPE_COMPLIANCE,
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
