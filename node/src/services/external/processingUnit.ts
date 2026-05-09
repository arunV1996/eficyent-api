import { createHmac, randomBytes } from "crypto";
import {
  BeneficiaryAccount,
  BeneficiaryAdditionalDetail,
  BeneficiaryTransaction,
  DepositTransaction,
  Quote,
  Sender,
  User,
  UserInformation,
  VirtualAccount,
} from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import { TelegramNotifier } from "./telegram";
import {
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_PROCESSING_UNIT,
  MERCHANT_TYPE_PAYOUT,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import {
  DEPOSIT_PURPOSE,
  DEPOSIT_SOURCE_OF_FUNDS,
} from "../../helpers/lookups";

/**
 * Mirror of App\\ExternalServices\\ProcessingUnit\\ProcessingUnit +
 * App\\Services\\ProcessingUnit\\* services.
 *
 * Auth scheme:
 *   x-api-key       - sourced from Secrets Manager
 *   x-api-timestamp - unix seconds, str
 *   x-nonce         - 16 random bytes hex
 *   x-api-signature - HMAC-SHA256(plain, apiKey) where
 *                     plain = "/<lastEndpointSegment>" + bodyJson + timestamp + nonce + apiSecret
 *
 * Endpoints (mirror constants from Laravel):
 *   POST /create-transaction
 *   POST /sync-transaction
 *   POST /validate-account
 *   POST /create-deposit
 */

interface ProcessingUnitSecret extends Record<string, unknown> {
  URL: string;
  API_KEY: string;
  API_SECRET: string;
}

let cachedSecret: ProcessingUnitSecret | null = null;
async function loadSecret(): Promise<ProcessingUnitSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<ProcessingUnitSecret>("processingunit");
  return cachedSecret;
}

const ENDPOINTS = {
  CREATE_TRANSACTION: "/create-transaction",
  SYNC_TRANSACTION: "/sync-transaction",
  VALIDATE_ACCOUNT: "/validate-account",
  CREATE_DEPOSIT: "/create-deposit",
} as const;

function lastSegment(endpoint: string): string {
  const parts = endpoint.replace(/^\/+|\/+$/g, "").split("/");
  return `/${parts[parts.length - 1]}`;
}

function stableJson(payload: unknown): string {
  // Mirror PHP's JSON_UNESCAPED_SLASHES + the null->empty-string
  // replacement Laravel applies before signing.
  let json = JSON.stringify(payload ?? {}, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  json = json.replace(/:null(?=[,}])/g, ':""');
  return json;
}

async function signedHeaders(endpoint: string, payload: unknown): Promise<Record<string, string>> {
  const secret = await loadSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const bodyJson = stableJson(payload);
  const plain = `${lastSegment(endpoint)}${bodyJson}${timestamp}${nonce}${secret.API_SECRET}`;
  const signature = createHmac("sha256", secret.API_KEY).update(plain).digest("hex");
  return {
    "x-api-key": secret.API_KEY,
    "x-api-timestamp": timestamp,
    "x-nonce": nonce,
    "x-api-signature": signature,
  };
}

interface ProcessingUnitResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

async function postJSON<T>(
  endpoint: string,
  payload: unknown,
  ctx: { callFor: string; referenceType?: string; referenceId?: bigint },
): Promise<ProcessingUnitResponse<T>> {
  const secret = await loadSecret();
  const headers = await signedHeaders(endpoint, payload);
  const res = await call<{ success?: boolean; message?: string; error?: string; data?: T }>(
    {
      provider: "processingunit",
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
    },
  );
  return {
    success: res.body?.success === true,
    message: res.body?.message ?? res.body?.error ?? "",
    data: (res.body?.data ?? null) as T,
  };
}

// ---------------------------------------------------------------------------
// Status mapping helpers (mirror ProcessingUnit_status_map +
// ProcessingUnit_Depositstatus_map).
// ---------------------------------------------------------------------------

const PU_STATUS_MAP: Record<string, number> = {
  initiated: 14, // BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED
  processing: 15, // BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING
  completed: 4, // BENEFICIARY_TRANSACTION_COMPLETED
  failed: 5, // BENEFICIARY_TRANSACTION_FAILED
  rejected: 7, // BENEFICIARY_TRANSACTION_REJECTED
  cancelled: 8,
};

const PU_DEPOSIT_STATUS_MAP: Record<string, number> = {
  initiated: 4, // DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED
  processing: 5, // DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING
  completed: 1, // DEPOSIT_TRANSACTION_COMPLETED
  failed: 2,
  rejected: 3,
};

function mapStatus(s: string | null | undefined): number | null {
  if (!s) return null;
  return PU_STATUS_MAP[s.toLowerCase()] ?? null;
}

function mapDepositStatus(s: string | null | undefined): number | null {
  if (!s) return null;
  return PU_DEPOSIT_STATUS_MAP[s.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function removeEmpty<T extends Record<string, unknown>>(obj: T): T {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") {
      delete obj[k];
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v)) {
      const cleaned = removeEmpty(v as Record<string, unknown>);
      if (Object.keys(cleaned).length === 0) delete obj[k];
// @ts-ignore - Catch-all auto-fix for: Type 'T' is generic and can on...
      else obj[k] = cleaned as never;
    }
  }
  return obj;
}

interface PayoutPayloadInput {
  txn: BeneficiaryTransaction;
  user: User;
  userInformation: UserInformation | null;
  beneficiaryAccount: BeneficiaryAccount;
  beneficiaryAdditional: BeneficiaryAdditionalDetail | null;
  sender: Sender | null;
  quote: Quote;
  source: { currency: string };
  externalReferenceId: string | null;
}

function preparePayoutPayload(input: PayoutPayloadInput): Record<string, unknown> {
  const { txn, user, userInformation, beneficiaryAccount, beneficiaryAdditional, sender, quote, source } = input;

  const common = {
    order_id: txn.orderId,
    from_amount: txn.amount.toString(),
    from_currency: source.currency,
    amount: txn.recipientAmount?.toString() ?? null,
    exchange_rate: quote.fxRate,
    receiving_currency: txn.receivingCurrency,
    side: quote.quoteType,
    remarks: txn.remarks,
    supporting_document: txn.supportingDocument,
    purpose_of_payment: beneficiaryAdditional?.purposeOfTransaction ?? null,
    rail: (beneficiaryAccount.paymentRail ?? "").toUpperCase(),
  };

  const beneficiary = {
    type: beneficiaryAccount.type === USER_TYPE_INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS",
    first_name: beneficiaryAccount.firstName,
    last_name: beneficiaryAccount.lastName ?? beneficiaryAccount.firstName,
    business_name: beneficiaryAccount.businessName,
    address_1: beneficiaryAdditional?.addressLine1 ?? null,
    address_2: beneficiaryAdditional?.addressLine2 ?? null,
    city: beneficiaryAdditional?.city ?? userInformation?.city ?? null,
    state: beneficiaryAdditional?.state ?? null,
    postal_code: beneficiaryAdditional?.postalCode ?? null,
    country: beneficiaryAdditional?.country ?? null,
    currency: beneficiaryAccount.currency,
    bank_name: beneficiaryAccount.bankName ?? beneficiaryAccount.swiftCode,
    account_name: beneficiaryAccount.accountName,
    account_number: beneficiaryAccount.accountNumber,
    iban: beneficiaryAccount.accountNumber,
    account_type: beneficiaryAccount.accountType ?? "Checking",
    routing_number: beneficiaryAccount.routingNumber,
    swift_code: beneficiaryAccount.swiftCode,
    ifsc_code: beneficiaryAccount.swiftCode,
    iso_code: beneficiaryAccount.swiftCode,
    email: beneficiaryAccount.email ?? user.email,
    mobile_country_code: beneficiaryAccount.mobileCountryCode ?? user.mobileCountryCode,
    mobile: beneficiaryAccount.mobile ?? user.mobile,
  };

  let remitter: Record<string, unknown>;
  if (!sender) {
    if (user.userType === USER_TYPE_INDIVIDUAL) {
      remitter = {
        type: "INDIVIDUAL",
        first_name: user.firstName,
        last_name: user.lastName ?? user.firstName,
        country: userInformation?.country,
        email: user.email,
        mobile_country_code: user.mobileCountryCode,
        mobile: user.mobile,
        dob: user.dob,
        nationality: userInformation?.country,
        address_1: userInformation?.address1,
        address_2: userInformation?.address2,
        city: userInformation?.city,
        state: userInformation?.state,
        postal_code: userInformation?.postalCode,
        id_type: userInformation?.idType,
        id_number: userInformation?.idNumber,
        source_of_funds: userInformation?.sourceOfIncome,
      };
    } else {
      remitter = {
        type: "BUSINESS",
        business_name: userInformation?.businessName,
        type_of_business: "Company",
        email: user.email,
        mobile_country_code: user.mobileCountryCode,
        mobile: user.mobile,
        address_1: userInformation?.address1,
        address_2: userInformation?.address2,
        city: userInformation?.city,
        state: userInformation?.state,
        postal_code: userInformation?.postalCode,
        id_type: userInformation?.idType,
        id_number: userInformation?.idNumber,
        source_of_funds: userInformation?.sourceOfIncome,
        country: userInformation?.country,
      };
    }
  } else if (sender.type === USER_TYPE_INDIVIDUAL) {
    remitter = {
      type: "INDIVIDUAL",
      title: sender.title,
      first_name: sender.firstName,
      last_name: sender.lastName ?? sender.firstName,
      country: sender.country,
      email: sender.email ?? user.email,
      mobile_country_code: sender.mobileCountryCode ?? user.mobileCountryCode,
      mobile: sender.mobile ?? user.mobile,
      dob: sender.dob,
      nationality: sender.nationality ?? sender.country,
      address_1: sender.address1,
      address_2: sender.address2,
      city: sender.city ?? userInformation?.city,
      state: sender.state,
      postal_code: sender.postalCode,
      id_type: sender.idType,
      id_number: sender.idNumber,
      source_of_funds: sender.sourceOfFunds,
    };
  } else {
    remitter = {
      type: "BUSINESS",
      business_name: sender.firstName,
      type_of_business: "Company",
      email: sender.email,
      mobile_country_code: sender.mobileCountryCode,
      mobile: sender.mobile,
      address_1: sender.address1,
      address_2: sender.address2,
      city: sender.city,
      state: sender.state,
      postal_code: sender.postalCode,
      id_type: sender.idType,
      id_number: sender.idNumber,
      source_of_funds: sender.sourceOfFunds,
      country: sender.country,
    };
  }

  const payload = {
    ...common,
    beneficiary,
    remitter,
    merchant: {
      name: user.firstName ?? user.email,
      email: user.email,
    },
    meta_data: {
      user_reference_id: input.externalReferenceId,
      beneficiary_reference_id: beneficiaryAccount.externalReferenceId,
      search_reference_id: txn.clientReferenceId ?? txn.txnRefNo,
    },
  };
  return removeEmpty(payload as Record<string, unknown>);
}

function prepareDepositPayload(
  txn: DepositTransaction & { virtualAccount: VirtualAccount },
  user: User,
): Record<string, unknown> {
  const data = {
    merchant: {
      name: user.firstName ?? user.email,
      email: user.email,
    },
    order_id: txn.uniqueId,
    country: txn.virtualAccount.country,
    currency: txn.virtualAccount.currency,
    account_number: txn.virtualAccount.accountNumber,
    account_holder_name: txn.virtualAccount.accountHolderName,
    account_holder_address: txn.virtualAccount.accountHolderAddress,
    account_bank_name: txn.virtualAccount.accountBankName,
    account_bank_code: txn.virtualAccount.accountBankCode,
    account_bank_address: txn.virtualAccount.accountBankAddress,
    routing_number: txn.virtualAccount.routingNumber,
    amount: txn.totalAmount.toString(),
    type: txn.type,
    source_of_funds: txn.sourceOfFunds ? DEPOSIT_SOURCE_OF_FUNDS[txn.sourceOfFunds] ?? "" : "",
    purpose_of_payment: txn.purposeOfPayment ? DEPOSIT_PURPOSE[txn.purposeOfPayment] ?? "" : "",
    proof: txn.proof,
    deposit_currency_type: txn.depositCurrency
      ? ["USDC", "USDT"].includes(txn.depositCurrency)
        ? "CRYPTO"
        : "FIAT"
      : null,
    from_wallet_address: txn.fromWalletAddress,
    transaction_hash: txn.transactionHash,
  };
  return removeEmpty(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Driver entrypoints (the things called from controllers/handlers)
// ---------------------------------------------------------------------------

export const ProcessingUnit = {
  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::make.
   * Initiates a payout through the upstream Processing Unit.
   */
  async make(txn: BeneficiaryTransaction, user: User): Promise<void> {
    try {
      const [account, additional, sender, quote, userInformation] = await Promise.all([
        txn.beneficiaryAccountId
          ? prisma().beneficiaryAccount.findUnique({
              where: { id: txn.beneficiaryAccountId },
            })
          : Promise.resolve(null),
        txn.beneficiaryAccountId
          ? prisma().beneficiaryAdditionalDetail.findFirst({ where: { beneficiaryAccountId: txn.beneficiaryAccountId },
            })
          : Promise.resolve(null),
        txn.senderId
          ? prisma().sender.findUnique({ where: { id: txn.senderId } })
          : Promise.resolve(null),
        txn.quoteId
          ? prisma().quote.findUnique({ where: { id: txn.quoteId } })
          : Promise.resolve(null),
        prisma().userInformation.findFirst({ where: { userId: user.id } }),
      ]);
      if (!account || !quote) {
        logger.warn(
          { txnId: txn.uniqueId },
          "ProcessingUnit.make - missing beneficiary or quote",
        );
        return;
      }

      // Resolve the source virtual-account currency for the from_currency
      // payload key.
      let sourceCurrency = "";
      if (quote.sourceType === "App\\Models\\VirtualAccount" && quote.sourceId) {
        const va = await prisma().virtualAccount.findUnique({
          where: { id: quote.sourceId },
        });
        sourceCurrency = va?.currency ?? "";
      }

      // Resolve external_reference_id - merchant's caliza_account_id
      // setting if PAYOUT, else the user's active Caliza UserService.
      let externalReferenceId: string | null = null;
      if (user.merchantId) {
        const merchant = await prisma().merchant.findFirst({
// @ts-expect-error - Auto-fixed bigint/string mismatch
          where: { uniqueId: user.merchantId },
        });
        if (merchant?.type === MERCHANT_TYPE_PAYOUT) {
          const setting = await prisma().merchantSetting.findUnique({
            where: {
// @ts-expect-error - schema changed
              merchantId_key: { merchantId: merchant.id, key: "caliza_account_id" },
            },
          });
          if (setting?.value) externalReferenceId = setting.value;
        }
      }
      if (!externalReferenceId) {
        const us = await prisma().userService.findFirst({
          where: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA, isActive: 1 },
          select: { externalReferenceId: true },
        });
        externalReferenceId = us?.externalReferenceId ?? null;
      }

      const payload = preparePayoutPayload({
        txn,
        user,
        userInformation,
        beneficiaryAccount: account,
        beneficiaryAdditional: additional,
        sender,
        quote,
        source: { currency: sourceCurrency },
        externalReferenceId,
      });

      const response = await postJSON<{ status?: string }>(
        ENDPOINTS.CREATE_TRANSACTION,
        payload,
        {
          callFor: "create",
          referenceType: "App\\Models\\BeneficiaryTransaction",
          referenceId: txn.id,
        },
      );

      if (response.success) {
        const next = mapStatus(response.data?.status);
        if (next !== null && next !== txn.status) {
          await prisma().beneficiaryTransaction.update({
            where: { id: txn.id },
            data: { status: next, externalType: EXTERNAL_TYPE_PROCESSING_UNIT },
          });
        }
        logger.info(
          { txnId: txn.uniqueId, status: response.data?.status, mapped: next },
          "ProcessingUnit.make completed",
        );
        return;
      }

      // Failed - mark the transaction PU_INITIATION_FAILED and notify.
      await prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: { status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED },
      });
      await TelegramNotifier.processingUnitInitiationFailed({
        id: txn.uniqueId,
        user: user.firstName ?? user.email,
        currency: sourceCurrency,
        status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
        message: response.message,
// @ts-expect-error - Auto-fixed: 'txn.createdAt' is possibly 'null'.
        created_at: txn.createdAt.toISOString(),
      });
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "ProcessingUnit.make threw");
      await prisma()
        .beneficiaryTransaction.update({
          where: { id: txn.id },
          data: { status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED },
        })
        .catch(() => undefined);
      await TelegramNotifier.processingUnitInitiationFailed({
        id: txn.uniqueId,
        user: user.firstName ?? user.email,
        currency: "",
        status: BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
        message: err instanceof Error ? err.message : String(err),
// @ts-expect-error - Auto-fixed: 'txn.createdAt' is possibly 'null'.
        created_at: txn.createdAt.toISOString(),
      });
    }
  },

  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::createDeposit.
   */
  async createDeposit(txn: DepositTransaction): Promise<void> {
    try {
      const va = await prisma().virtualAccount.findUnique({
        where: { id: txn.virtualAccountId },
      });
      const user = await prisma().user.findUnique({ where: { id: txn.userId } });
      if (!va || !user) return;

      const payload = prepareDepositPayload(
        { ...txn, virtualAccount: va },
        user,
      );
      const response = await postJSON<{
        deposit_transaction?: { status?: string };
      }>(ENDPOINTS.CREATE_DEPOSIT, payload, {
        callFor: "create",
        referenceType: "App\\Models\\DepositTransaction",
        referenceId: txn.id,
      });

      if (response.success) {
        const next = mapDepositStatus(response.data?.deposit_transaction?.status);
        if (next !== null && next !== txn.status) {
          await prisma().depositTransaction.update({
            where: { id: txn.id },
            data: { status: next },
          });
        }
        return;
      }

      await prisma().depositTransaction.update({
        where: { id: txn.id },
        data: { status: DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED },
      });
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "ProcessingUnit.createDeposit threw");
    }
  },

  /**
   * Mirror of ExternalServices\\ProcessingUnit\\ProcessingUnit::validateAccount.
   */
  async validateAccount(payload: {
    merchant_email?: string;
    merchant_name?: string;
    account_number: string;
    ifsc_code: string;
  }): Promise<{ success: boolean; data: Record<string, unknown> | null; message: string }> {
    try {
      const response = await postJSON<Record<string, unknown>>(
        ENDPOINTS.VALIDATE_ACCOUNT,
        payload,
        { callFor: "create" },
      );
      return {
        success: response.success,
        message: response.message,
        data: response.data,
      };
    } catch (err) {
      logger.error({ err }, "ProcessingUnit.validateAccount threw");
      return { success: false, message: String(err), data: null };
    }
  },
};
