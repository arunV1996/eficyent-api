import Decimal from "decimal.js";
import { getRedis } from "../config/redis";
import DepositTransaction from "../models/deposit_transaction.model";
import { DEPOSIT_TYPE_TOPUP } from "../utils/constants";
import { call } from "./http_client.service";

/**
 * InvoiceMate accounting reporter (mirror of the legacy
 * services/external/invoiceMate.ts). Best-effort: never throws.
 *
 * Auth: cached bearer token from the auth endpoint (email/password) +
 * X-API-Key header; the token is cached for 1 hour in Redis under
 * "invoicemate:token" — same key as legacy, so both services share it.
 *
 * Configuration comes from the environment (same keys as the legacy
 * EXTERNAL_INVOICEMATE_* secret/env bundle):
 *   EXTERNAL_INVOICEMATE_URL                  base URL
 *   EXTERNAL_INVOICEMATE_EMAIL / _PASSWORD    auth credentials
 *   EXTERNAL_INVOICEMATE_API_KEY              X-API-Key header
 *   EXTERNAL_INVOICEMATE_AUTH_TOKEN_ENDPOINT  POST auth path
 *   EXTERNAL_INVOICEMATE_DEPOSIT_ENDPOINT     POST deposit path
 *   EXTERNAL_INVOICEMATE_IS_ENABLED           "false" disables it
 *
 * Ported so far: makeDeposit (the deposit-store fan-out). makePayout
 * is fired by the payout worker and arrives with that tranche.
 */

interface InvoiceMateConfig {
    baseUrl: string;
    email: string;
    password: string;
    apiKey: string;
    authTokenEndpoint: string;
    depositEndpoint: string;
    enabled: boolean;
}

const loadConfig = (): InvoiceMateConfig | null => {
    const baseUrl = process.env.EXTERNAL_INVOICEMATE_URL;
    const email = process.env.EXTERNAL_INVOICEMATE_EMAIL;
    const password = process.env.EXTERNAL_INVOICEMATE_PASSWORD;
    const apiKey = process.env.EXTERNAL_INVOICEMATE_API_KEY;
    const authTokenEndpoint =
        process.env.EXTERNAL_INVOICEMATE_AUTH_TOKEN_ENDPOINT;
    const depositEndpoint = process.env.EXTERNAL_INVOICEMATE_DEPOSIT_ENDPOINT;
    if (
        !baseUrl ||
        !email ||
        !password ||
        !apiKey ||
        !authTokenEndpoint ||
        !depositEndpoint
    ) {
        return null;
    }
    return {
        baseUrl,
        email,
        password,
        apiKey,
        authTokenEndpoint,
        depositEndpoint,
        enabled: String(process.env.EXTERNAL_INVOICEMATE_IS_ENABLED) !== "false",
    };
};

const getAuthToken = async (
    config: InvoiceMateConfig,
): Promise<string | null> => {
    const redis = getRedis();
    const cacheKey = "invoicemate:token";
    const cached = await redis.get(cacheKey);
    if (cached) {
        return cached;
    }

    const response = await call<{ token?: string; apiKey?: string }>(
        { provider: "invoicemate", callFor: "create" },
        {
            method: "POST",
            baseUrl: config.baseUrl,
            path: config.authTokenEndpoint,
            body: { email: config.email, password: config.password },
            timeoutMs: 30_000,
        },
    );
    const token = response.body?.token;
    if (!token) {
        return null;
    }
    await redis.set(cacheKey, token, "EX", 60 * 60);
    return token;
};

/**
 * Mirror of the legacy maskData: keeps the first and last characters,
 * masks the middle.
 */
const maskData = (value: string | null | undefined): string => {
    const stringValue = value ?? "";
    if (stringValue.length <= 2) {
        return "*".repeat(stringValue.length);
    }
    return `${stringValue.slice(0, 1)}${"*".repeat(stringValue.length - 2)}${stringValue.slice(-1)}`;
};

/**
 * Mirror of InvoiceMate::makeDeposit + Helper::notifyAccounts —
 * records a deposit for accounting. Best-effort; never throws.
 */
export const makeDeposit = async (
    deposit: DepositTransaction,
    accountsRecordUniqueId?: string,
): Promise<void> => {
    try {
        const config = loadConfig();
        if (!config || !config.enabled) {
            return;
        }
        const token = await getAuthToken(config);
        if (!token) {
            return;
        }

        const payload = {
            unique_id: accountsRecordUniqueId ?? deposit.uniqueId,
            // Matches the Laravel hardcoded literal.
            user: maskData("Lulu"),
            total_amount: new Decimal(deposit.totalAmount).toString(),
            currency: deposit.depositCurrency ?? "",
            type: DEPOSIT_TYPE_TOPUP.toUpperCase(),
            status: deposit.status,
            created_at: deposit.createdAt
                ? deposit.createdAt.toISOString()
                : new Date().toISOString(),
        };
        await call(
            {
                provider: "invoicemate",
                callFor: "create",
                referenceType: "App\\Models\\DepositTransaction",
                referenceId: deposit.id,
            },
            {
                method: "POST",
                baseUrl: config.baseUrl,
                path: config.depositEndpoint,
                body: payload,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "X-API-Key": config.apiKey,
                },
                timeoutMs: 30_000,
            },
        );
    } catch (reportError) {
        // eslint-disable-next-line no-console
        console.warn("InvoiceMate.makeDeposit failed:", reportError);
    }
};
