import crypto from "crypto";
import { depositTransactionCallbackPayload } from "../helpers/callback_payload.helper";
import { Dispatch } from "../jobs";
import AdminWallet from "../models/admin_wallet.model";
import DepositTransaction from "../models/deposit_transaction.model";
import DepositTransactionStatusHistory from "../models/deposit_transaction_status_history.model";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_COMPLETED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    CALLBACK_DEPOSIT_FAILED,
    CALLBACK_DEPOSIT_SUCCESS,
    DEPOSIT_PURPOSE,
    DEPOSIT_SOURCE_OF_FUNDS,
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    DEPOSIT_TRANSACTION_REJECTED,
    EXTERNAL_TYPE_PROCESSING_UNIT,
} from "../utils/constants";
import { call } from "./http_client.service";

/**
 * Processing Unit provider service (mirror of the legacy
 * services/external/processingUnit.ts).
 *
 * Ported so far: validateAccount and the deposit leg (createDeposit +
 * status maps). Deferred with the payout-worker/provider tranche: the
 * payout initiation (`make`, which needs the 576-line payout payload
 * builder) and the withdraw-side consumers of the status map.
 *
 * Configuration comes from the environment:
 *   PROCESSING_UNIT_URL          base URL of the PU API
 *   PROCESSING_UNIT_API_KEY      HMAC key (also sent as x-api-key)
 *   PROCESSING_UNIT_API_SECRET   appended to the signature plaintext
 *   PROCESSING_UNIT_TIMEOUT_SEC  per-request timeout, default 90
 */

const ENDPOINTS = {
    VALIDATE_ACCOUNT: "api/v1/verify_account",
    INITIATE_DEPOSIT: "api/v1/initiate-deposit",
};

/**
 * Mirror of App\Helpers\ViewHelper::ProcessingUnit_status_map — maps
 * the upstream PU string status onto the canonical integer statuses.
 * Unknown statuses default to the PROCESSING variants so the row stays
 * visible to ops dashboards instead of silently freezing.
 */
export interface PuStatusResult {
    mapped: number;
    isNew: boolean;
    original: string;
}

const WITHDRAW_STATUS_MAP: Record<string, number> = {
    PENDING: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
    INPROGRESS: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    SUCCESS: BENEFICIARY_TRANSACTION_COMPLETED,
    PARTIALLY_FAILED: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    FAILED: BENEFICIARY_TRANSACTION_FAILED,
    REJECTED: BENEFICIARY_TRANSACTION_FAILED,
};

const DEPOSIT_STATUS_MAP: Record<string, number> = {
    PENDING: DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
    INPROGRESS: DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    SUCCESS: DEPOSIT_TRANSACTION_COMPLETED,
    FAILED: DEPOSIT_TRANSACTION_FAILED,
};

export const mapProcessingUnitWithdrawStatus = (
    status: string,
): PuStatusResult => {
    const mapped = WITHDRAW_STATUS_MAP[status];
    if (mapped === undefined) {
        // eslint-disable-next-line no-console
        console.warn("New Processing Unit status received:", status);
        return {
            mapped: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
            isNew: true,
            original: status,
        };
    }
    return { mapped, isNew: false, original: status };
};

export const mapProcessingUnitDepositStatus = (
    status: string,
): PuStatusResult => {
    const mapped = DEPOSIT_STATUS_MAP[status];
    if (mapped === undefined) {
        // eslint-disable-next-line no-console
        console.warn("New Processing Unit deposit status received:", status);
        return {
            mapped: DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
            isNew: true,
            original: status,
        };
    }
    return { mapped, isNew: false, original: status };
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

/**
 * Recursively strips null/undefined/"" leaves (and then-empty objects)
 * from the outbound payload — mirror of the legacy removeEmptyValues.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const removeEmptyValues = (input: Record<string, any>): Record<string, any> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
        if (value !== null && value !== undefined && value !== "") {
            if (typeof value === "object" && value.constructor === Object) {
                const cleanedObject = removeEmptyValues(value);
                if (Object.keys(cleanedObject).length > 0) {
                    result[key] = cleanedObject;
                }
            } else {
                result[key] = value;
            }
        }
    }
    return result;
};

/**
 * Mirror of the legacy prepareDepositPayload — assembles the
 * initiate-deposit body from the deposit row + its virtual account,
 * user/merchant identity and (crypto deposits) the admin wallet.
 */
const prepareDepositPayload = async (
    deposit: DepositTransaction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> => {
    const virtualAccount = await VirtualAccount.findByPk(
        deposit.virtualAccountId,
    );
    const user = await User.findByPk(deposit.userId);
    if (!virtualAccount || !user) {
        throw new Error(
            "Virtual account or user not found for payload preparation",
        );
    }

    const merchant = user.merchantId
        ? await Merchant.findByPk(user.merchantId)
        : null;
    const adminWallet = deposit.adminWalletId
        ? await AdminWallet.findByPk(deposit.adminWalletId, {
              paranoid: false,
          })
        : null;

    const sourceFunds = DEPOSIT_SOURCE_OF_FUNDS[deposit.sourceOfFunds ?? ""] ?? "";
    const purposes = DEPOSIT_PURPOSE[deposit.purposeOfPayment ?? ""] ?? "";

    const depositCurrency = deposit.depositCurrency
        ? deposit.depositCurrency.toUpperCase()
        : null;
    const depositCurrencyType = depositCurrency
        ? ["USDC", "USDT"].includes(depositCurrency)
            ? "CRYPTO"
            : "FIAT"
        : null;

    const userName = user.firstName
        ? `${user.firstName} ${user.lastName ?? ""}`.trim()
        : user.email;

    const data = {
        merchant: {
            name: merchant ? merchant.name : userName,
            email: merchant ? merchant.email : user.email,
        },
        order_id: deposit.uniqueId,
        country: virtualAccount.country,
        currency: virtualAccount.currency,
        account_number: virtualAccount.accountNumber,
        account_holder_name: virtualAccount.accountHolderName,
        account_holder_address: virtualAccount.accountHolderAddress,
        account_bank_name: virtualAccount.accountBankName,
        account_bank_code: virtualAccount.accountBankCode,
        account_bank_address: virtualAccount.accountBankAddress,
        routing_number: virtualAccount.routingNumber,
        amount: deposit.totalAmount,
        type: deposit.type,
        source_of_funds: sourceFunds,
        purpose_of_payment: purposes,
        proof: deposit.proof ?? null,
        deposit_currency_type: depositCurrencyType,
        network_type: adminWallet?.network ?? null,
        from_wallet_address: deposit.fromWalletAddress ?? null,
        to_wallet_Address: adminWallet?.walletAddress ?? null,
        transaction_hash: deposit.transactionHash ?? null,
    };

    return removeEmptyValues(data);
};

const writeDepositStatusHistory = async (
    depositTransactionId: number,
    fromStatus: number,
    toStatus: number,
): Promise<void> => {
    await DepositTransactionStatusHistory.create({
        uniqueId: generateUniqueId(24),
        depositTransactionId,
        fromStatus: String(fromStatus),
        toStatus: String(toStatus),
        changedBy: "system",
        changedByType: "system",
        changedAt: new Date(),
    });
};

const dispatchDepositCallback = async (
    deposit: DepositTransaction,
    eventType: string,
): Promise<void> => {
    await Dispatch.callback({
        userId: String(deposit.userId),
        eventType,
        payload: depositTransactionCallbackPayload(deposit),
        depositTransactionUniqueId: deposit.uniqueId,
    }).catch(() => undefined);
};

/**
 * Mirror of ExternalServices\ProcessingUnit::createDeposit — initiates
 * the deposit upstream, maps the returned status onto the row (with a
 * status-history entry) and enqueues the merchant callback for
 * terminal states. Best-effort: failures mark the row PU_FAILED and
 * never throw.
 */
export const createDeposit = async (
    deposit: DepositTransaction,
): Promise<void> => {
    try {
        const transactionPayload = await prepareDepositPayload(deposit);

        const response = await postJSON<
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            any
        >(ENDPOINTS.INITIATE_DEPOSIT, transactionPayload, {
            callFor: "create",
            referenceType: "App\\Models\\DepositTransaction",
            referenceId: deposit.id,
        });

        if (response.success) {
            const depositTransactionObject =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (response.data as any)?.deposit_transaction ?? response.data;
            const providerStatus = depositTransactionObject?.status ?? null;

            if (providerStatus) {
                const mappedStatus =
                    mapProcessingUnitDepositStatus(providerStatus).mapped;

                if (deposit.status !== mappedStatus) {
                    const previousStatus = deposit.status;
                    deposit.status = mappedStatus;
                    const updated = await deposit.save();
                    await writeDepositStatusHistory(
                        deposit.id,
                        previousStatus,
                        mappedStatus,
                    );

                    if (mappedStatus === DEPOSIT_TRANSACTION_COMPLETED) {
                        await dispatchDepositCallback(
                            updated,
                            CALLBACK_DEPOSIT_SUCCESS,
                        );
                    } else if (
                        [
                            DEPOSIT_TRANSACTION_FAILED,
                            DEPOSIT_TRANSACTION_REJECTED,
                            DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
                        ].includes(mappedStatus)
                    ) {
                        await dispatchDepositCallback(
                            updated,
                            CALLBACK_DEPOSIT_FAILED,
                        );
                    }
                }
            }
            return;
        }

        const previousStatus = deposit.status;
        deposit.status = DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED;
        const updated = await deposit.save();
        await writeDepositStatusHistory(
            deposit.id,
            previousStatus,
            DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
        );
        await dispatchDepositCallback(updated, CALLBACK_DEPOSIT_FAILED);
    } catch (providerError) {
        // eslint-disable-next-line no-console
        console.error(
            "Processing Unit deposit initiation failed:",
            deposit.uniqueId,
            providerError instanceof Error
                ? providerError.message
                : providerError,
        );

        const previousStatus = deposit.status;
        deposit.status = DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED;
        const updated = await deposit.save().catch(() => undefined);
        await writeDepositStatusHistory(
            deposit.id,
            previousStatus,
            DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
        ).catch(() => undefined);
        if (updated) {
            await dispatchDepositCallback(updated, CALLBACK_DEPOSIT_FAILED);
        }
    }
};
