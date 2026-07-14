import { createHmac } from "crypto";
import User from "../models/user.model";
import { CodedError } from "../helpers/coded_error.helper";
import {
    ID_VERIFIED_BY_HERALD_SUMSUB,
    ID_VERIFIED_BY_INCODE,
    IDENTITY_VERIFICATION_COMPLETED,
    IDENTITY_VERIFICATION_FAILED,
    IDENTITY_VERIFICATION_INITIATED,
    IDENTITY_VERIFICATION_PROCESSING,
    ONBOARDING_STEP_FOUR_COMPLETED,
} from "../utils/constants";
import { call } from "./http_client.service";

/**
 * KYC providers + factory (mirror of the legacy kycContract /
 * heraldSumsubKyc / incodeKyc / kycFactory).
 *
 * Each driver implements:
 *   make(user)   — start a verification; returns the redirect URL the
 *                  user must visit ("" when webhook-driven)
 *   status(user) — poll the provider and update the user row
 *                  (id_verification, id_verified_by, optionally
 *                  onboarding_step)
 *
 * Configuration comes from the environment (same keys as the legacy
 * EXTERNAL_HERALD_SUMSUB_* / EXTERNAL_INCODE_* secret/env bundles).
 */

export interface KycDriver {
    make(user: User): Promise<string>;
    status(user: User): Promise<void>;
}

// ─── HeraldSumsub ───────────────────────────────────────────────────

interface HeraldConfig {
    baseUrl: string;
    apiKey: string;
    saltKey: string;
    merchantId: string;
    accessTokenEndpoint: string;
    statusEndpoint: string;
}

const loadHeraldConfig = (): HeraldConfig => {
    const baseUrl = process.env.EXTERNAL_HERALD_SUMSUB_URL;
    const apiKey = process.env.EXTERNAL_HERALD_SUMSUB_X_API_KEY;
    const saltKey = process.env.EXTERNAL_HERALD_SUMSUB_SALT_KEY;
    const merchantId = process.env.EXTERNAL_HERALD_SUMSUB_MERCHANT_ID;
    const accessTokenEndpoint =
        process.env.EXTERNAL_HERALD_SUMSUB_ACCESS_TOKEN_ENDPOINT;
    const statusEndpoint = process.env.EXTERNAL_HERALD_SUMSUB_STATUS_ENDPOINT;
    if (
        !baseUrl ||
        !apiKey ||
        !saltKey ||
        !merchantId ||
        !accessTokenEndpoint ||
        !statusEndpoint
    ) {
        throw new Error(
            "HeraldSumsub is not configured (EXTERNAL_HERALD_SUMSUB_*)",
        );
    }
    return {
        baseUrl,
        apiKey,
        saltKey,
        merchantId,
        accessTokenEndpoint,
        statusEndpoint,
    };
};

/**
 * Herald HMAC scheme: plain = endpointPath + json(body) + timestamp +
 * saltKey, HMAC-SHA256 keyed by the api key.
 */
const heraldSignedHeaders = (
    config: HeraldConfig,
    endpointPath: string,
    body: unknown,
): Record<string, string> => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const json = JSON.stringify(body ?? {});
    const plain = `${endpointPath}${json}${timestamp}${config.saltKey}`;
    const signature = createHmac("sha256", config.apiKey)
        .update(plain)
        .digest("hex");
    return {
        "X-Api-Key": config.apiKey,
        "X-Api-Timestamp": timestamp,
        "X-Api-Signature": signature,
    };
};

const heraldApplyStatus = async (
    user: User,
    status: string,
    data: Record<string, unknown> | null,
): Promise<void> => {
    if (status === "Approved") {
        await User.update(
            {
                idVerification: IDENTITY_VERIFICATION_COMPLETED,
                idVerifiedBy: ID_VERIFIED_BY_HERALD_SUMSUB,
                onboardingStep: ONBOARDING_STEP_FOUR_COMPLETED,
                ...(data ? { idVerificationData: data } : {}),
            },
            { where: { id: user.id } },
        );
    } else if (status === "Initiated") {
        await User.update(
            {
                idVerification: IDENTITY_VERIFICATION_INITIATED,
                idVerifiedBy: ID_VERIFIED_BY_HERALD_SUMSUB,
                ...(data ? { idVerificationData: data } : {}),
            },
            { where: { id: user.id } },
        );
    } else if (data) {
        await User.update(
            { idVerificationData: data },
            { where: { id: user.id } },
        );
    }
};

export const HeraldSumsub: KycDriver = {
    async make(user: User): Promise<string> {
        const config = loadHeraldConfig();
        const body = {
            first_name: user.firstName,
            last_name: user.lastName,
            middle_name: user.middleName ?? "",
            dob: user.dob,
            email: user.email,
            mobile: user.mobile,
            user_id: config.merchantId,
        };
        const headers = heraldSignedHeaders(
            config,
            config.accessTokenEndpoint,
            body,
        );
        const response = await call<{
            success?: boolean;
            message?: string;
            data?: { kyc_status?: string; redirect_url?: string };
        }>(
            {
                provider: "herald_sumsub",
                callFor: "create",
                referenceType: "App\\Models\\User",
                referenceId: user.id,
            },
            {
                method: "POST",
                baseUrl: config.baseUrl,
                path: config.accessTokenEndpoint,
                body,
                headers,
                timeoutMs: 30_000,
            },
        );
        if (!response.body?.success) {
            throw new Error(
                response.body?.message ?? "Herald KYC initiate failed",
            );
        }
        const data = response.body.data ?? {};
        if (data.kyc_status) {
            await heraldApplyStatus(user, data.kyc_status, null);
        }
        return data.redirect_url ?? "";
    },

    async status(user: User): Promise<void> {
        const config = loadHeraldConfig();
        const queryBody = { email: user.email };
        const headers = heraldSignedHeaders(
            config,
            config.statusEndpoint,
            queryBody,
        );
        const response = await call<{
            success?: boolean;
            message?: string;
            data?: { kyc_status?: string; [key: string]: unknown };
        }>(
            {
                provider: "herald_sumsub",
                callFor: "status_check",
                referenceType: "App\\Models\\User",
                referenceId: user.id,
            },
            {
                method: "GET",
                baseUrl: config.baseUrl,
                path: config.statusEndpoint,
                query: queryBody,
                headers,
                timeoutMs: 30_000,
            },
        );
        if (!response.body?.success || !response.body.data?.kyc_status) {
            return;
        }
        await heraldApplyStatus(
            user,
            response.body.data.kyc_status,
            response.body.data,
        );
    },
};

// ─── Incode ─────────────────────────────────────────────────────────

interface IncodeConfig {
    baseUrl: string;
    apiKey: string;
    apiVersion: string;
    configurationId: string;
    clientId: string;
    timeoutSeconds: number;
    omniStartEndpoint: string;
    getUrlEndpoint: string;
    getScoreEndpoint: string;
}

const loadIncodeConfig = (): IncodeConfig => {
    const baseUrl = process.env.EXTERNAL_INCODE_URL;
    const apiKey = process.env.EXTERNAL_INCODE_API_KEY;
    const apiVersion = process.env.EXTERNAL_INCODE_API_VERSION;
    const configurationId = process.env.EXTERNAL_INCODE_CONFIGURATION_ID;
    const clientId = process.env.EXTERNAL_INCODE_CLIENT_ID;
    const omniStartEndpoint = process.env.EXTERNAL_INCODE_OMNI_START_ENDPOINT;
    const getUrlEndpoint = process.env.EXTERNAL_INCODE_GET_URL_ENDPOINT;
    const getScoreEndpoint = process.env.EXTERNAL_INCODE_GET_SCORE_ENDPOINT;
    if (
        !baseUrl ||
        !apiKey ||
        !apiVersion ||
        !configurationId ||
        !clientId ||
        !omniStartEndpoint ||
        !getUrlEndpoint ||
        !getScoreEndpoint
    ) {
        throw new Error("Incode is not configured (EXTERNAL_INCODE_*)");
    }
    return {
        baseUrl,
        apiKey,
        apiVersion,
        configurationId,
        clientId,
        timeoutSeconds: parseInt(
            process.env.EXTERNAL_INCODE_TIMEOUT_SEC || "30",
            10,
        ),
        omniStartEndpoint,
        getUrlEndpoint,
        getScoreEndpoint,
    };
};

const incodeBaseHeaders = (config: IncodeConfig): Record<string, string> => {
    return {
        "Api-Version": config.apiVersion,
        "x-api-key": config.apiKey,
    };
};

/**
 * Map Incode's overall.status onto the IDENTITY_VERIFICATION_* enum
 * (mirror of format_incode_status()).
 */
export const formatIncodeStatus = (
    status: string | undefined | null,
): number => {
    switch (String(status ?? "").toUpperCase()) {
        case "OK":
        case "APPROVED":
            return IDENTITY_VERIFICATION_COMPLETED;
        case "FAIL":
        case "FAILED":
        case "DECLINED":
            return IDENTITY_VERIFICATION_FAILED;
        case "PROCESSING":
        case "PENDING":
            return IDENTITY_VERIFICATION_PROCESSING;
        default:
            return IDENTITY_VERIFICATION_INITIATED;
    }
};

export const Incode: KycDriver = {
    async make(user: User): Promise<string> {
        const config = loadIncodeConfig();

        // 1. Start an OMNI session.
        const startResponse = await call<{
            interviewId?: string;
            token?: string;
            message?: string;
        }>(
            {
                provider: "incode",
                callFor: "create",
                referenceType: "App\\Models\\User",
                referenceId: user.id,
            },
            {
                method: "POST",
                baseUrl: config.baseUrl,
                path: config.omniStartEndpoint,
                body: { configurationId: config.configurationId },
                headers: incodeBaseHeaders(config),
                timeoutMs: config.timeoutSeconds * 1000,
            },
        );
        if (!startResponse.body?.interviewId || !startResponse.body?.token) {
            throw new Error(
                startResponse.body?.message ?? "Incode start failed",
            );
        }
        const { interviewId, token } = startResponse.body;

        // 2. Get the redirect URL.
        const urlResponse = await call<{ url?: string; message?: string }>(
            {
                provider: "incode",
                callFor: "create",
                referenceType: "App\\Models\\User",
                referenceId: user.id,
            },
            {
                method: "GET",
                baseUrl: config.baseUrl,
                path: config.getUrlEndpoint,
                query: { components: "qr", clientId: config.clientId },
                headers: {
                    ...incodeBaseHeaders(config),
                    "X-Incode-Hardware-Id": token,
                },
                timeoutMs: config.timeoutSeconds * 1000,
            },
        );
        if (!urlResponse.body?.url) {
            throw new Error(
                urlResponse.body?.message ?? "Incode get-url failed",
            );
        }

        // 3. Persist the initiated state.
        await User.update(
            {
                idVerification: IDENTITY_VERIFICATION_INITIATED,
                idVerifiedBy: ID_VERIFIED_BY_INCODE,
                idVerificationData: { interviewId, token },
            },
            { where: { id: user.id } },
        );
        return urlResponse.body.url;
    },

    async status(user: User): Promise<void> {
        const config = loadIncodeConfig();
        const data = (user.idVerificationData ?? {}) as {
            interviewId?: string;
            token?: string;
        };
        if (!data.interviewId || !data.token) {
            return;
        }

        const response = await call<{
            overall?: { status?: string };
            [key: string]: unknown;
        }>(
            {
                provider: "incode",
                callFor: "status_check",
                referenceType: "App\\Models\\User",
                referenceId: user.id,
            },
            {
                method: "GET",
                baseUrl: config.baseUrl,
                path: config.getScoreEndpoint,
                query: { id: data.interviewId },
                headers: {
                    ...incodeBaseHeaders(config),
                    "X-Incode-Hardware-Id": data.token,
                },
                timeoutMs: config.timeoutSeconds * 1000,
            },
        );
        const overall = response.body?.overall;
        if (!overall) {
            return;
        }
        const nextStatus = formatIncodeStatus(overall.status);
        await User.update(
            {
                idVerification: nextStatus,
                idVerifiedBy: ID_VERIFIED_BY_INCODE,
                ...(nextStatus === IDENTITY_VERIFICATION_COMPLETED
                    ? {
                          idVerificationData: response.body,
                          onboardingStep: ONBOARDING_STEP_FOUR_COMPLETED,
                      }
                    : {}),
            },
            { where: { id: user.id } },
        );
    },
};

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Mirror of App\Factories\Kyc\KycFactory. Surepass is a bank-validation
 * provider upstream, so it is intentionally not registered here.
 */
export const resolveKycDriver = (serviceTag: string): KycDriver => {
    switch (serviceTag) {
        case ID_VERIFIED_BY_HERALD_SUMSUB:
            return HeraldSumsub;
        case ID_VERIFIED_BY_INCODE:
            return Incode;
        default:
            throw new CodedError(
                "Onboarding service is not supported.",
                113,
                400,
            );
    }
};
