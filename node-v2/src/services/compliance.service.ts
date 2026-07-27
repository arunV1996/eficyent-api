import { randomUUID } from "crypto";
import { getRedis } from "../config/redis";
import {
    findValueByKey,
    formatProcessingUnitFxRate,
} from "../helpers/lookup.helper";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import BeneficiaryTransactionStatusHistory from "../models/beneficiary_transaction_status_history.model";
import ExternalServiceCall from "../models/external_service_call.model";
import Merchant from "../models/merchant.model";
import MobileCountryCode from "../models/mobile_country_code.model";
import Quote from "../models/quote.model";
import Sender from "../models/sender.model";
import User from "../models/user.model";
import UserInformation from "../models/user_information.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import { call } from "./http_client.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
    COMPLIANCE_ACCOUNT_TYPE_MAP,
    COMPLIANCE_ID_TYPE_MAP,
    COMPLIANCE_PURPOSE_OF_PAYMENT_MAP,
    COMPLIANCE_SOURCE_OF_FUNDS_MAP,
    EXTERNAL_TYPE_COMPLIANCE,
    USER_TYPE_BUSINESS,
} from "../utils/constants";

/**
 * Compliance gateway client (mirror of the legacy
 * services/external/compliance.ts / App\Services\Compliance +
 * ComplianceService).
 *
 * Auth: a bearer access token from POST <access-token endpoint> keyed
 * on email/password, cached in Redis for 20 minutes (matching the
 * Laravel 1200s cache TTL). Every outbound create carries:
 *   Authorization: Bearer <accessToken>
 *   Idempotency-Key: <uuid v4>
 *   x-api-key: <api key>
 *
 * Configuration (EXTERNAL_COMPLIANCE_* env, mirror of the legacy
 * Secrets.external("compliance") bundle):
 *   EXTERNAL_COMPLIANCE_URL
 *   EXTERNAL_COMPLIANCE_EMAIL
 *   EXTERNAL_COMPLIANCE_PASSWORD
 *   EXTERNAL_COMPLIANCE_API_KEY
 *   EXTERNAL_COMPLIANCE_CREATE_TRANSACTION_ENDPOINT
 *   EXTERNAL_COMPLIANCE_ACCESS_TOKEN_ENDPOINT
 *   EXTERNAL_COMPLIANCE_TIMEOUT_SEC        (default 30)
 *   EXTERNAL_COMPLIANCE_EXTERNAL_CLIENT_ID / _NAME / _CODE
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ComplianceConfig {
    url: string;
    email: string;
    password: string;
    apiKey: string;
    createTransactionEndpoint: string;
    accessTokenEndpoint: string;
    timeoutSeconds: number;
    externalClientId: string;
    externalClientName: string;
    externalClientCode: string;
}

const loadConfig = (): ComplianceConfig => {
    const url = process.env.EXTERNAL_COMPLIANCE_URL;
    const email = process.env.EXTERNAL_COMPLIANCE_EMAIL;
    const password = process.env.EXTERNAL_COMPLIANCE_PASSWORD;
    const apiKey = process.env.EXTERNAL_COMPLIANCE_API_KEY;
    const createTransactionEndpoint =
        process.env.EXTERNAL_COMPLIANCE_CREATE_TRANSACTION_ENDPOINT;
    const accessTokenEndpoint =
        process.env.EXTERNAL_COMPLIANCE_ACCESS_TOKEN_ENDPOINT;
    if (
        !url ||
        !email ||
        !password ||
        !apiKey ||
        !createTransactionEndpoint ||
        !accessTokenEndpoint
    ) {
        throw new Error(
            "Compliance is not configured (EXTERNAL_COMPLIANCE_URL / _EMAIL / _PASSWORD / _API_KEY / _CREATE_TRANSACTION_ENDPOINT / _ACCESS_TOKEN_ENDPOINT)",
        );
    }
    return {
        url,
        email,
        password,
        apiKey,
        createTransactionEndpoint,
        accessTokenEndpoint,
        timeoutSeconds: parseInt(
            process.env.EXTERNAL_COMPLIANCE_TIMEOUT_SEC || "30",
            10,
        ),
        externalClientId: process.env.EXTERNAL_COMPLIANCE_EXTERNAL_CLIENT_ID || "",
        externalClientName:
            process.env.EXTERNAL_COMPLIANCE_EXTERNAL_CLIENT_NAME || "",
        externalClientCode:
            process.env.EXTERNAL_COMPLIANCE_EXTERNAL_CLIENT_CODE || "",
    };
};

const TOKEN_CACHE_KEY = "compliance:access_token";
const TOKEN_TTL_SEC = 1200;

const getAccessToken = async (config: ComplianceConfig): Promise<string> => {
    const redis = getRedis();
    const cached = await redis.get(TOKEN_CACHE_KEY);
    if (cached) {
        return cached;
    }

    const response = await call<{
        data?: { tokens?: { accessToken?: string } };
    }>(
        { provider: EXTERNAL_TYPE_COMPLIANCE, callFor: "create" },
        {
            method: "POST",
            baseUrl: config.url,
            path: config.accessTokenEndpoint,
            body: {
                email: config.email,
                mfaRequired: true,
                password: config.password,
            },
            timeoutMs: config.timeoutSeconds * 1000,
        },
    );
    const accessToken = response.body?.data?.tokens?.accessToken;
    if (!accessToken) {
        throw new Error("Compliance access token missing");
    }
    await redis.set(TOKEN_CACHE_KEY, accessToken, "EX", TOKEN_TTL_SEC);
    return accessToken;
};

const authedHeaders = async (
    config: ComplianceConfig,
): Promise<Record<string, string>> => {
    const token = await getAccessToken(config);
    return {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": randomUUID(),
        "x-api-key": config.apiKey,
    };
};

interface ComplianceResponse<T = unknown> {
    success: boolean;
    message: string;
    data: T | null;
}

const postJSON = async <T>(
    config: ComplianceConfig,
    endpoint: string,
    payload: unknown,
    context: { callFor: string; referenceType?: string; referenceId?: number },
): Promise<ComplianceResponse<T>> => {
    const headers = await authedHeaders(config);
    const response = await call<{
        success?: boolean;
        message?: string;
        data?: T;
    }>(
        {
            provider: EXTERNAL_TYPE_COMPLIANCE,
            callFor: context.callFor,
            referenceType: context.referenceType,
            referenceId: context.referenceId,
        },
        {
            method: "POST",
            baseUrl: config.url,
            path: endpoint,
            body: payload,
            headers,
            timeoutMs: config.timeoutSeconds * 1000,
        },
    );
    return {
        success: response.body?.success === true,
        message: response.body?.message ?? "",
        data: (response.body?.data ?? null) as T | null,
    };
};

const recordFailedInitiation = async (
    beneficiaryTransactionId: number,
    action: string,
    errorMessage: string,
    startTime: number,
    payload?: unknown,
    endpoint?: string,
): Promise<void> => {
    try {
        await ExternalServiceCall.create({
            externalType: EXTERNAL_TYPE_COMPLIANCE,
            action: `initiation_failed:${action}`,
            method: "POST",
            endpoint: endpoint ?? null,
            beneficiaryTransactionId,
            requestPayload: payload ? { body: payload } : null,
            responsePayload: null,
            httpStatus: null,
            success: false,
            errorMessage,
            responseTimeMs: Date.now() - startTime,
        });
    } catch (auditError) {
        // eslint-disable-next-line no-console
        console.error(
            "Failed to write compliance initiation failure audit log:",
            beneficiaryTransactionId,
            auditError,
        );
    }
};

const getAlpha2Code = async (
    alpha3Code: string | null | undefined,
): Promise<string> => {
    if (!alpha3Code) {
        return "";
    }
    const code = await MobileCountryCode.findOne({ where: { alpha3Code } });
    return code ? code.alpha2Code : alpha3Code;
};

const formatDate = (value: Date | string | null | undefined): string => {
    if (!value) {
        return "";
    }
    try {
        const date = value instanceof Date ? value : new Date(value);
        const parts = date.toISOString().split("T");
        return parts[0] ?? "";
    } catch {
        return "";
    }
};

const getMappedValue = (
    map: Record<string, string>,
    value: string,
    type: string,
    defaultValue = "",
): string => {
    const normalizedValue = value.toUpperCase().trim();
    if (map[normalizedValue]) {
        return map[normalizedValue];
    }
    // eslint-disable-next-line no-console
    console.warn("Compliance mapping missing:", type, value);
    return defaultValue || "OTHERS";
};

const mapAccountType = (value: string | null | undefined): string => {
    if (!value) {
        return "OTHER";
    }
    return getMappedValue(
        COMPLIANCE_ACCOUNT_TYPE_MAP,
        value,
        "Account Type",
        "OTHER",
    );
};

const mapIdType = (value: string | null | undefined): string => {
    if (!value) {
        return "OTHERS";
    }
    return getMappedValue(COMPLIANCE_ID_TYPE_MAP, value, "ID_TYPE", "OTHERS");
};

const mapSourceOfFunds = (value: string | null | undefined): string => {
    if (!value) {
        return "OTHER";
    }
    return getMappedValue(
        COMPLIANCE_SOURCE_OF_FUNDS_MAP,
        value,
        "SOURCE_OF_FUNDS",
        "OTHER",
    );
};

const mapPurposeOfPayment = (value: string | null | undefined): string => {
    if (!value) {
        return "OTHER";
    }
    return getMappedValue(
        COMPLIANCE_PURPOSE_OF_PAYMENT_MAP,
        value,
        "PURPOSE_OF_PAYMENT",
        "OTHER",
    );
};

// Keys the compliance schema requires even when their values are empty.
// Verbatim keys skip cleaning entirely (externalClient must go out with
// whatever the env provides, metadata stays the literal [] / {}).
const PRESERVE_VERBATIM_KEYS = new Set(["metadata", "externalClient"]);
// Required nested objects: inner fields are still cleaned, but the
// object itself survives even when everything inside was empty.
const PRESERVE_OBJECT_KEYS = new Set(["address", "bankDetails"]);
// Required scalars: kept (as "") instead of being stripped when empty.
const PRESERVE_SCALAR_KEYS = new Set(["bankName", "routingNumber"]);

/**
 * Mirror of the legacy removeEmptyValues — recursively strips
 * null/undefined/"" and empty arrays/objects, EXCEPT for the schema-
 * required keys above, which the compliance gateway expects to always
 * be present in the payload.
 */
export const removeEmptyValues = (data: any): any => {
    if (data === null || data === undefined || data === "") {
        return undefined;
    }
    if (typeof data === "object") {
        if (Array.isArray(data)) {
            const cleanedArray = data
                .map(removeEmptyValues)
                .filter(
                    (value) =>
                        value !== undefined && value !== null && value !== "",
                );
            return cleanedArray.length > 0 ? cleanedArray : undefined;
        }
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            if (PRESERVE_VERBATIM_KEYS.has(key)) {
                result[key] = value;
                continue;
            }
            if (
                PRESERVE_OBJECT_KEYS.has(key) &&
                value !== null &&
                typeof value === "object" &&
                !Array.isArray(value)
            ) {
                result[key] = removeEmptyValues(value) ?? {};
                continue;
            }
            if (PRESERVE_SCALAR_KEYS.has(key)) {
                const cleaned = removeEmptyValues(value);
                result[key] = cleaned !== undefined ? cleaned : (value ?? "");
                continue;
            }
            const cleaned = removeEmptyValues(value);
            if (cleaned !== undefined && cleaned !== null && cleaned !== "") {
                result[key] = cleaned;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }
    return data;
};

/**
 * Mirror of ComplianceService::make. Submits a payout to the compliance
 * gateway; on success the transaction moves to COMPLIANCE_INITIATED and
 * the provider response lands in compliance_data (so the inbound
 * compliance webhook can match on compliance_data.transaction_id); on
 * failure it moves to COMPLIANCE_INITIATION_FAILED. When updateStatus is
 * false (compliance batch mode) only the compliance_data is persisted.
 * Best-effort: never throws to the caller.
 */
export const make = async (
    transaction: BeneficiaryTransaction,
    user: User,
    updateStatus = true,
): Promise<void> => {
    const startTime = Date.now();
    let payload: unknown = undefined;
    let endpoint: string | undefined = undefined;
    try {
        const quote = await Quote.findByPk(transaction.quoteId ?? undefined);
        if (!quote) {
            throw new Error("Compliance.make - Quote not found");
        }

        const beneficiaryAccount = await BeneficiaryAccount.findByPk(
            transaction.beneficiaryAccountId ?? undefined,
        );
        if (!beneficiaryAccount) {
            throw new Error("Compliance.make - BeneficiaryAccount not found");
        }
        const beneficiaryAdditionalDetail =
            await BeneficiaryAdditionalDetail.findOne({
                where: { beneficiaryAccountId: beneficiaryAccount.id },
            });

        const sender = transaction.senderId
            ? await Sender.findByPk(transaction.senderId)
            : null;

        let ownerUser = user;
        let merchant: Merchant | null = null;
        if (user.merchantId) {
            merchant = await Merchant.findByPk(user.merchantId);
            if (merchant) {
                const owner = await User.findByPk(merchant.userId);
                if (owner) {
                    ownerUser = owner;
                }
            }
        }

        // Prefer the owner's ID info; fall back to the acting user's when
        // the owner has none.
        let userInformation = await UserInformation.findOne({
            where: { userId: ownerUser.id },
        });
        if (
            !userInformation ||
            (!userInformation.idNumber && !userInformation.idType)
        ) {
            const initiatorUserInfo = await UserInformation.findOne({
                where: { userId: user.id },
            });
            if (
                initiatorUserInfo &&
                (initiatorUserInfo.idNumber || initiatorUserInfo.idType)
            ) {
                userInformation = initiatorUserInfo;
            }
        }

        let config: ComplianceConfig;
        try {
            config = loadConfig();
            endpoint = config.createTransactionEndpoint;
        } catch (configError) {
            const errorMessage = `Failed to load compliance secrets: ${
                configError instanceof Error
                    ? configError.message
                    : String(configError)
            }`;
            await recordFailedInitiation(
                transaction.id,
                "load_secrets",
                errorMessage,
                startTime,
            );
            throw configError;
        }

        let senderType: string;
        let senderName: string;
        if (sender) {
            senderType =
                Number(sender.type) === USER_TYPE_BUSINESS
                    ? "BUSINESS"
                    : "INDIVIDUAL";
            senderName = `${sender.firstName || ""} ${sender.lastName || ""}`.trim();
        } else {
            senderType =
                Number(ownerUser.userType) === USER_TYPE_BUSINESS
                    ? "BUSINESS"
                    : "INDIVIDUAL";
            senderName =
                Number(ownerUser.userType) === USER_TYPE_BUSINESS
                    ? merchant
                        ? merchant.name
                        : (userInformation?.businessName ?? "")
                    : `${ownerUser.firstName || ""} ${ownerUser.lastName || ""}`.trim();
        }

        let sourceCountry: string | null = null;
        let sourceCurrency = "USD";
        if (quote.sourceId && quote.sourceType) {
            if (quote.sourceType.includes("VirtualAccount")) {
                const virtualAccount = await VirtualAccount.findByPk(
                    quote.sourceId,
                );
                sourceCountry = virtualAccount?.country ?? null;
                sourceCurrency = virtualAccount?.currency ?? "USD";
            } else if (quote.sourceType.includes("Wallet")) {
                const wallet = await Wallet.findByPk(quote.sourceId);
                sourceCurrency = wallet?.currency ?? "USD";
            }
        }

        // Corridor: source country (from the VA) falls back to the
        // originator's country when null; both sides normalized to alpha2.
        const fromCountryRaw =
            sourceCountry ||
            (sender ? sender.country : userInformation?.country) ||
            null;
        const fromCountry = fromCountryRaw
            ? await getAlpha2Code(fromCountryRaw)
            : "";
        const toCountry = quote.recipientCountry
            ? await getAlpha2Code(quote.recipientCountry)
            : "";
        const corridor =
            fromCountry && toCountry ? `${fromCountry}-${toCountry}` : null;

        let idTypeRaw = "";
        if (sender) {
            idTypeRaw = sender.idType
                ? await findValueByKey(sender.idType, "id_types")
                : "";
        } else {
            idTypeRaw = userInformation?.idType
                ? await findValueByKey(userInformation.idType, "id_types")
                : "";
        }
        const idTypeMapped = mapIdType(idTypeRaw);

        const dobString = sender
            ? sender.dob
                ? formatDate(sender.dob)
                : ""
            : ownerUser.dob
              ? formatDate(ownerUser.dob)
              : "";

        // merchant owner's compliance_merchant_id when acting as a
        // sub-user, otherwise the acting user's own.
        const complianceMerchantId = user.merchantId
            ? (ownerUser.complianceMerchantId ?? null)
            : (user.complianceMerchantId ?? null);

        const beneficiaryType =
            Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "INDIVIDUAL";
        const beneficiaryFullName =
            Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
                ? (beneficiaryAccount.businessName ?? "")
                : `${beneficiaryAccount.firstName || ""} ${beneficiaryAccount.lastName || ""}`.trim();

        const payloadObj: Record<string, any> = {
            externalId: transaction.orderId ? String(transaction.orderId) : "",
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
                    : Number(ownerUser.userType) === USER_TYPE_BUSINESS
                      ? merchant
                          ? merchant.name
                          : (userInformation?.businessName ?? "")
                      : (ownerUser.firstName ?? ""),
                middleName: sender
                    ? (sender.middleName ?? "")
                    : Number(ownerUser.userType) === USER_TYPE_BUSINESS
                      ? ""
                      : (ownerUser.middleName ?? ""),
                lastName: sender
                    ? (sender.lastName ?? "")
                    : ownerUser.lastName || user.lastName || "",
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
                    number: sender
                        ? (sender.idNumber ?? "")
                        : userInformation?.idNumber ||
                          userInformation?.taxId ||
                          "",
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
                    : merchant
                      ? merchant.email
                      : (ownerUser.email ?? ""),
                occupation: "",
                employer: "",
            },
            beneficiary: {
                partyType: beneficiaryType,
                fullName: beneficiaryFullName,
                firstName:
                    Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
                        ? (beneficiaryAccount.businessName ?? "")
                        : (beneficiaryAccount.firstName ?? ""),
                middleName:
                    Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
                        ? ""
                        : (beneficiaryAccount.middleName ?? ""),
                lastName:
                    Number(beneficiaryAccount.type) === USER_TYPE_BUSINESS
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
                    countryCode:
                        beneficiaryAccount.mobileCountryCode ??
                        ownerUser.mobileCountryCode ??
                        "",
                    number:
                        beneficiaryAccount.mobile ?? ownerUser.mobile ?? "",
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
            amount: Number(transaction.amount),
            currency: sourceCurrency,
            amountUsd: Number(transaction.amount),
            destinationAmount: Number(transaction.recipientAmount),
            destinationCurrency: transaction.receivingCurrency ?? "",
            exchangeRate: Number(formatProcessingUnitFxRate(quote.fxRate)),
            paymentMethod:
                (transaction.receivingCurrency ?? "") !== "USD"
                    ? "BANK_TRANSFER"
                    : beneficiaryAccount.paymentRail
                      ? String(beneficiaryAccount.paymentRail).toUpperCase()
                      : "BANK_TRANSFER",
            payoutMethod: "BANK_DEPOSIT",
            sourceOfFunds: "",
            purposeOfPayment: "",
            originatorCountry: sender
                ? (sender.country ?? "")
                : (userInformation?.country ?? ""),
            beneficiaryCountry: beneficiaryAccount.country ?? "",
            corridor,
            fees: {
                serviceFee: 0,
                fxFee: 0,
                totalFee: Number(transaction.commissionAmount),
                feeCurrency: "USD",
            },
            agent: {
                agentId: "",
                agentName: "",
                agentLocation: "",
            },
            isExternalClient: 1,
            externalClient: {
                id: config.externalClientId,
                name: config.externalClientName,
                code: config.externalClientCode,
            },
            metadata: [],
        };

        let sourceOfFundsRaw = "";
        if (sender) {
            sourceOfFundsRaw = sender.sourceOfFunds
                ? await findValueByKey(sender.sourceOfFunds)
                : "";
        } else {
            sourceOfFundsRaw = userInformation?.sourceOfIncome
                ? await findValueByKey(userInformation.sourceOfIncome)
                : "";
        }
        payloadObj.sourceOfFunds = mapSourceOfFunds(sourceOfFundsRaw);

        let purposeOfPaymentRaw = "";
        if (beneficiaryAdditionalDetail?.purposeOfTransaction) {
            purposeOfPaymentRaw = await findValueByKey(
                beneficiaryAdditionalDetail.purposeOfTransaction,
            );
        }
        payloadObj.purposeOfPayment = mapPurposeOfPayment(purposeOfPaymentRaw);

        payload = removeEmptyValues(payloadObj);

        let response: ComplianceResponse<{ status?: string }>;
        try {
            response = await postJSON<{ status?: string }>(
                config,
                endpoint,
                payload,
                {
                    callFor: "create",
                    referenceType: "App\\Models\\BeneficiaryTransaction",
                    referenceId: transaction.id,
                },
            );
        } catch (postError) {
            // Only record a synthetic audit row when the shared http
            // client didn't already write one for this create attempt.
            const existingAudit = await ExternalServiceCall.findOne({
                where: {
                    beneficiaryTransactionId: transaction.id,
                    externalType: EXTERNAL_TYPE_COMPLIANCE,
                    action: "create",
                },
            });
            if (!existingAudit) {
                const errorMessage = `Pre-request or authentication failure: ${
                    postError instanceof Error
                        ? postError.message
                        : String(postError)
                }`;
                await recordFailedInitiation(
                    transaction.id,
                    "authenticate_or_post",
                    errorMessage,
                    startTime,
                    payload,
                    endpoint,
                );
            }
            throw postError;
        }

        if (!response.success || !response.data) {
            // eslint-disable-next-line no-console
            console.warn(
                "Compliance create rejected:",
                transaction.uniqueId,
                response.message,
            );
            if (updateStatus) {
                const nextStatus =
                    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED;
                const previousStatus = transaction.status;
                transaction.status = nextStatus;
                await transaction.save();
                await BeneficiaryTransactionStatusHistory.create({
                    uniqueId: generateUniqueId(24),
                    beneficiaryTransactionId: transaction.id,
                    fromStatus: String(previousStatus),
                    toStatus: String(nextStatus),
                    changedBy: "system",
                    changedByType: "system",
                    changedAt: new Date(),
                });
            }
            return;
        }

        // Persist the provider response into compliance_data so the
        // inbound webhook can match by compliance_data.transaction_id.
        const previousStatus = transaction.status;
        const nextStatus = updateStatus
            ? BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED
            : previousStatus;
        transaction.complianceData = response.data;
        if (updateStatus) {
            transaction.status = nextStatus;
        }
        await transaction.save();
        if (updateStatus && nextStatus !== previousStatus) {
            await BeneficiaryTransactionStatusHistory.create({
                uniqueId: generateUniqueId(24),
                beneficiaryTransactionId: transaction.id,
                fromStatus: String(previousStatus),
                toStatus: String(nextStatus),
                changedBy: "system",
                changedByType: "system",
                changedAt: new Date(),
            });
        }
    } catch (complianceError) {
        // eslint-disable-next-line no-console
        console.error(
            "Compliance.make threw:",
            transaction.uniqueId,
            complianceError,
        );
        if (updateStatus) {
            const nextStatus =
                BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED;
            const previousStatus = transaction.status;
            transaction.status = nextStatus;
            await transaction.save().catch(() => undefined);
            await BeneficiaryTransactionStatusHistory.create({
                uniqueId: generateUniqueId(24),
                beneficiaryTransactionId: transaction.id,
                fromStatus: String(previousStatus),
                toStatus: String(nextStatus),
                changedBy: "system",
                changedByType: "system",
                changedAt: new Date(),
            }).catch(() => undefined);
        }
    }
};
