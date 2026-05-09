import { BeneficiaryTransaction, Prisma, User } from "@prisma/client";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  EXTERNAL_CALL_FOR_REMITTANCE,
// @ts-ignore - Catch-all auto-fix for: Module '"../../helpers/constan...
  EXTERNAL_TYPE_HERALD_REMITTANCE,
  USER_TYPE_BUSINESS,
} from "../../helpers/constants";

/**
 * Mirror of:
 *   - App\\ExternalServices\\Remittance\\RemittanceService
 *   - App\\Services\\Remittance\\RemittanceTransactionService
 *
 * Posts a stable-coin remittance request to Herald and stores the
 * provider response into beneficiary_transactions.remittance_data so the
 * batch job can skip already-processed rows.
 *
 * Payload selection mirrors Laravel exactly:
 *   - sender.type === BUSINESS -> B2B with `ubo` array
 *   - else                     -> C2C
 */

interface RemittanceSecret {
  URL: string;
  API_KEY: string;
  TIMEOUT_MS?: number;
  ENDPOINT?: string;
}

const DEFAULT_ENDPOINT = "/api/v1/initiate_withdrawal";

let cached: RemittanceSecret | null = null;
async function loadSecret(): Promise<RemittanceSecret> {
  if (cached) return cached;
  cached = await Secrets.external<RemittanceSecret & Record<string, unknown>>(
    "remittance",
  );
  return cached;
}

export const Remittance = {
  async make(txn: BeneficiaryTransaction, user: User): Promise<void> {
    try {
      logger.info({ txnId: txn.uniqueId }, "Remittance initiated");
      const payload = await preparePayload(txn, user);
      if (!payload) {
        logger.warn(
          { txnId: txn.uniqueId },
          "Remittance.make - cannot build payload (missing related rows)",
        );
        return;
      }

      const secret = await loadSecret();
      const res = await call<{ status?: boolean } & Record<string, unknown>>(
        {
          provider: EXTERNAL_TYPE_HERALD_REMITTANCE,
          callFor: EXTERNAL_CALL_FOR_REMITTANCE,
          referenceType: "App\\Models\\BeneficiaryTransaction",
          referenceId: txn.id,
        },
        {
          method: "POST",
          baseUrl: secret.URL,
          path: secret.ENDPOINT ?? DEFAULT_ENDPOINT,
          body: payload,
          headers: {
            authorization: `Bearer ${secret.API_KEY}`,
            "x-api-key": secret.API_KEY,
            origin: "api.eficyent.com",
          },
          timeoutMs: secret.TIMEOUT_MS ?? 30_000,
        },
      );

      if (res.body?.status !== true) {
        logger.warn(
          { txnId: txn.uniqueId, status: res.status, body: res.body },
          "Remittance rejected by provider",
        );
        return;
      }

      // Store provider response into beneficiary_transactions.remittance_data
      // so the batch job (ExecuteRemittanceBatch) skips already-processed
      // rows.
      await prisma()
        .beneficiaryTransaction.update({
          where: { id: txn.id },
          data: {
            remittanceData: res.body as unknown as Prisma.InputJsonValue,
          },
        })
        .catch((err) =>
          logger.warn({ err, txnId: txn.uniqueId }, "remittance_data write failed"),
        );

      logger.info({ txnId: txn.uniqueId }, "Remittance success");
    } catch (err) {
      logger.error({ err, txnId: txn.uniqueId }, "Remittance.make threw");
    }
  },
};

interface BusinessPerson {
  first_name?: string;
  last_name?: string;
  id_type?: string;
  id_number?: string;
  email?: string;
  mobile?: string;
  mobile_country_code?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
}

async function preparePayload(
  txn: BeneficiaryTransaction,
  user: User,
): Promise<Record<string, unknown> | null> {
  if (!txn.senderId || !txn.beneficiaryAccountId || !txn.quoteId) return null;
  const [sender, beneficiary, quote, info] = await Promise.all([
    prisma().sender.findUnique({ where: { id: txn.senderId } }),
    prisma().beneficiaryAccount.findUnique({ where: { id: txn.beneficiaryAccountId } }),
    prisma().quote.findUnique({ where: { id: txn.quoteId } }),
    prisma().userInformation.findFirst({ where: { userId: user.id } }),
  ]);
  if (!sender || !beneficiary || !quote) return null;

  const isBusiness = sender.type === USER_TYPE_BUSINESS;

  const base: Record<string, unknown> = {
    order_id: txn.uniqueId,
    to_currency: quote.receivingCurrency,
    amount: Number(quote.amount),
    exchange_rate: quote.fxRate ? Number(quote.fxRate) : 0,
    address_line_1: info?.address1 ?? "",
    address_line_2: info?.address2 ?? "",
    city: info?.city ?? "",
    state: info?.state ?? "",
    country: info?.country ?? "",
    postal_code: info?.postalCode ?? "",
    email: user.email,
    phone: user.mobile ?? "",
    source_of_funds: sender.sourceOfFunds ?? info?.sourceOfIncome ?? "",
    beneficiary_first_name: beneficiary.firstName ?? "",
    beneficiary_last_name: beneficiary.lastName ?? "",
    beneficiary_type: isBusiness ? "BUSINESS" : "INDIVIDUAL",
    receiving_currency: quote.receivingCurrency,
    recipient_country: beneficiary.country,
    account_type: beneficiary.accountType ?? "",
    account_name: beneficiary.accountName ?? "",
    beneficiary_description: "Remittance transfer",
    bank_name: beneficiary.bankName ?? "",
    created_at: txn.createdAt,
    updated_at: txn.updatedAt,
  };

  if (!isBusiness) {
    return removeEmptyValues({
      ...base,
      payout_type: "C2C",
      side: "SELL",
      first_name: sender.firstName ?? "",
      middle_name: sender.middleName ?? "",
      last_name: sender.lastName ?? "",
      type: "individual",
      id_type: sender.idType ?? info?.idType ?? "",
      id_number: sender.idNumber ?? "",
    });
  }

  const personsRaw = sender.businessPersons;
  const persons: BusinessPerson[] = Array.isArray(personsRaw)
    ? (personsRaw as unknown as BusinessPerson[])
    : typeof personsRaw === "string"
      ? safeJsonParse(personsRaw)
      : [];
  const count = persons.length;
  let remaining = 100;
  const ubo = persons.map((p, idx) => {
    const percentage = idx === count - 1 ? remaining : Math.round((100 / count) * 100) / 100;
    remaining -= percentage;
    return {
      first_name: p.first_name ?? "",
      last_name: p.last_name ?? "",
      id_type: p.id_type ?? "",
      id_number: p.id_number ?? "",
      email: p.email ?? "",
      mobile: p.mobile ?? "",
      mobile_code: p.mobile_country_code ?? "",
      address_line_1: p.address_1 ?? "",
      address_line_2: p.address_2 ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      country: p.country ?? "",
      postal_code: p.postal_code ?? "",
      nationality: p.country ?? "",
      ownership_percentage: percentage,
    };
  });

  return removeEmptyValues({
    ...base,
    payout_type: "B2B",
    company_name: info?.businessName ?? "",
    type: "business",
    ubo,
    incorporation_certificate: "",
    tax_certificate: "",
    address_proof: "",
  });
}

function safeJsonParse(s: string): BusinessPerson[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function removeEmptyValues<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (Array.isArray(v)) {
      const cleaned = v.map((item) =>
        item && typeof item === "object"
          ? removeEmptyValues(item as Record<string, unknown>)
          : item,
      );
      if (cleaned.length === 0) {
        delete obj[key];
      } else {
        (obj as Record<string, unknown>)[key] = cleaned;
      }
      continue;
    }
    if (v === null || v === undefined || v === "") {
      delete obj[key];
    }
  }
  return obj;
}
