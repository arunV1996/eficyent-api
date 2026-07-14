import crypto from "crypto";
import { call } from "./http_client.service";
import { EXTERNAL_TYPE_PROCESSING_UNIT } from "../utils/constants";

/**
 * Processing Unit provider service (mirror of the legacy
 * services/external/processingUnit.ts).
 *
 * Only validateAccount is ported so far — the payout / deposit
 * initiation methods arrive with the transactions tranche.
 *
 * Configuration comes from the environment:
 *   PROCESSING_UNIT_URL          base URL of the PU API
 *   PROCESSING_UNIT_API_KEY      HMAC key (also sent as x-api-key)
 *   PROCESSING_UNIT_API_SECRET   appended to the signature plaintext
 *   PROCESSING_UNIT_TIMEOUT_SEC  per-request timeout, default 90
 */

const ENDPOINTS = {
    VALIDATE_ACCOUNT: "api/v1/verify_account",
};

interface ProcessingUnitConfig {
    baseUrl: string;
    apiKey: string;
    apiSecret: string;
    timeoutSeconds: number;
}

const loadConfig = (): ProcessingUnitConfig => {
    const baseUrl = process.env.PROCESSING_UNIT_URL;
    const apiKey = process.env.PROCESSING_UNIT_API_KEY;
    const apiSecret = process.env.PROCESSING_UNIT_API_SECRET;
    if (!baseUrl || !apiKey || !apiSecret) {
        throw new Error(
            "Processing Unit is not configured (PROCESSING_UNIT_URL / _API_KEY / _API_SECRET)",
        );
    }
    return {
        baseUrl,
        apiKey,
        apiSecret,
        timeoutSeconds: parseInt(
            process.env.PROCESSING_UNIT_TIMEOUT_SEC || "90",
            10,
        ),
    };
};

/**
 * Mirror of Laravel ProcessingUnit::generateSignature. The signature
 * plaintext is: /<last endpoint segment> + body JSON (with :null
 * replaced by :"") + unix timestamp + nonce + api secret, HMAC-SHA256
 * keyed by the api key.
 */
const signRequest = (
    config: ProcessingUnitConfig,
    endpoint: string,
    bodyJson: string,
): {
    apiKey: string;
    timestamp: string;
    nonce: string;
    signature: string;
} => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString("hex");

    const endpointSegments = endpoint.split("/").filter(Boolean);
    const endpointForSignature =
        "/" + (endpointSegments[endpointSegments.length - 1] || "");

    const sanitizedBody = bodyJson.replace(/:null(?=[,}])/g, ':""');

    const plainContent =
        endpointForSignature +
        sanitizedBody +
        timestamp +
        nonce +
        config.apiSecret;

    const signature = crypto
        .createHmac("sha256", config.apiKey)
        .update(plainContent)
        .digest("hex");

    return { apiKey: config.apiKey, timestamp, nonce, signature };
};

interface ProviderResult<T> {
    success: boolean;
    message: string;
    data: T | null;
}

const postJSON = async <T>(
    endpoint: string,
    payload: unknown,
    context: { callFor: string; referenceType?: string; referenceId?: number },
): Promise<ProviderResult<T>> => {
    try {
        const config = loadConfig();
        const response = await call<{
            success?: boolean;
            message?: string;
            data?: T;
            error?: string;
        }>(
            {
                provider: EXTERNAL_TYPE_PROCESSING_UNIT,
                callFor: context.callFor,
                referenceType: context.referenceType,
                referenceId: context.referenceId,
            },
            {
                method: "POST",
                baseUrl: config.baseUrl,
                path: endpoint,
                body: payload,
                signRequest: (signContext) => {
                    const signatureParts = signRequest(
                        config,
                        endpoint,
                        signContext.bodyJson,
                    );
                    signContext.headers["x-api-key"] = signatureParts.apiKey;
                    signContext.headers["x-api-timestamp"] =
                        signatureParts.timestamp;
                    signContext.headers["x-nonce"] = signatureParts.nonce;
                    signContext.headers["x-api-signature"] =
                        signatureParts.signature;
                },
                timeoutMs: config.timeoutSeconds * 1000,
            },
        );

        return {
            success: response.body?.success === true,
            message: response.body?.message ?? response.body?.error ?? "",
            data: response.body?.data ?? (response.body as T) ?? null,
        };
    } catch (providerError) {
        return {
            success: false,
            message:
                providerError instanceof Error
                    ? providerError.message
                    : String(providerError),
            data: null,
        };
    }
};

/**
 * Mirror of ExternalServices\ProcessingUnit::validateAccount —
 * verifies an (account_number, ifsc) pair with the provider.
 */
export const validateAccount = async (payload: {
    merchant_email: string;
    merchant_name: string;
    account_number: string;
    ifsc_code: string;
}): Promise<ProviderResult<Record<string, unknown>>> => {
    return postJSON(ENDPOINTS.VALIDATE_ACCOUNT, payload, {
        callFor: "validate_account",
    });
};
