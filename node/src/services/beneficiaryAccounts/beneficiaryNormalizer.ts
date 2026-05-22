import { User } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import { prisma } from "../../db/prisma";
import {
  C2B,
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import { lookupsService } from "../lookups/lookupsService";
import {
  beneficiaryFormFields,
  FieldDef,
} from "../../helpers/formFields";
import {
  ensureNoFieldErrors,
  validateAgainstFields,
} from "../../helpers/formFieldsValidator";

/**
 * Mirror of App\\Validators\\BeneficiaryValidator. Builds dynamic rules per
 * (country, currency, type) and reshapes the validated payload into
 * { beneficiaryAccount, beneficiaryAccountAdditionalDetail } - the same
 * structure the BeneficiaryAccountRepository::create method expects.
 */

export interface NormalizedBeneficiaryPayload {
  beneficiaryAccount: Record<string, unknown>;
  beneficiaryAccountAdditionalDetail: Record<string, unknown>;
}

/**
 * Optional per-request memoization for bulk imports. The (country, currency,
 * type) tuple is constant across every row of a bulk file, so the supported
 * country list and dynamic form-field definitions resolve identically for each
 * row. Recomputing them per row issues ~30 redundant DB queries each time and
 * is what makes large bulk uploads time out. Callers that loop over many rows
 * pass a single shared cache so these lookups run once per distinct key.
 */
export interface BeneficiaryValidationCache {
  supported: Map<string, any[]>;
  fields: Map<string, FieldDef[]>;
}

export function createBeneficiaryValidationCache(): BeneficiaryValidationCache {
  return { supported: new Map(), fields: new Map() };
}

function coerceType(input: unknown): number {
  if (input === USER_TYPE_INDIVIDUAL || input === USER_TYPE_BUSINESS) return input;
  if (typeof input === "string") {
    const upper = input.trim().toUpperCase();
    if (upper === "PERSONAL" || upper === "INDIVIDUAL") return USER_TYPE_INDIVIDUAL;
    if (upper === "BUSINESS") return USER_TYPE_BUSINESS;
    const n = Number(upper);
    if (n === USER_TYPE_INDIVIDUAL || n === USER_TYPE_BUSINESS) return n;
  }
  return USER_TYPE_INDIVIDUAL;
}

export async function validateAndNormalize(
  payload: Record<string, unknown>,
  user: User,
  cachedSupportedCountries?: any[],
  cache?: BeneficiaryValidationCache,
): Promise<NormalizedBeneficiaryPayload> {
  const type = coerceType(payload.type);
  const country = String(payload.country ?? "");
  const currency = String(payload.currency ?? "");

  if (!country || !currency) {
    throw new ApiException(422, "country and currency are required.", 422);
  }

  // Mirror of BeneficiaryValidator::rules - block C2B and verify the
  // country/currency pair against the user's allowed list.
  const paymentType = lookupsService.formatPaymentType(user.userType, type);
  if (paymentType === C2B) throw new ApiException(195);

  let supported: any[];
  if (cache) {
    const hit = cache.supported.get(paymentType);
    if (hit) {
      supported = hit;
    } else {
      supported = cachedSupportedCountries ?? (await lookupsService.receivingCountries(paymentType, user));
      cache.supported.set(paymentType, supported);
    }
  } else {
    supported = cachedSupportedCountries ?? (await lookupsService.receivingCountries(paymentType, user));
  }
  const country_match = supported.find((c) => c.country_code === country);
  if (!country_match) {
    throw new ApiException(422, "Country is not supported for this beneficiary type.", 422);
  }
  if (!country_match.currencies.includes(currency)) {
    throw new ApiException(422, "Currency is not supported for the selected country.", 422);
  }

  let fields: FieldDef[];
  if (cache) {
    const fieldsKey = `${country}|${currency}|${type}`;
    const hit = cache.fields.get(fieldsKey);
    if (hit) {
      fields = hit;
    } else {
      fields = await beneficiaryFormFields({ country, currency, type });
      cache.fields.set(fieldsKey, fields);
    }
  } else {
    fields = await beneficiaryFormFields({ country, currency, type });
  }
  const result = validateAgainstFields(fields, payload);
  const validated = ensureNoFieldErrors(result);

  // service_bank lookup - convert unique_id back to bank_id, capture bank_name.
  let serviceBankBankId: string | undefined;
  let serviceBankName: string | undefined;
  if (validated.service_bank) {
    const bank = await prisma().serviceBank.findFirst({
      where: { uniqueId: String(validated.service_bank) },
    });
    if (bank) {
      serviceBankBankId = bank.bankId;
      serviceBankName = bank.bankName;
    }
  }

  // SWIFT/BIC fallback when only bank_name is supplied.
  let swiftCode = (validated.swift_code || validated.code) as string | undefined;
  if (!swiftCode && validated.bank_name) {
    const bank = await prisma().serviceBank.findFirst({
      where: { bankName: String(validated.bank_name) },
    });
    if (bank?.isoCode) swiftCode = bank.isoCode;
  }

  // account_name fallback: derive from first/last or business name.
  const accountName =
    (validated.account_name as string | undefined) ||
    [validated.first_name, validated.last_name]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .join(" ")
      .trim() ||
    (validated.business_name as string | undefined) ||
    "";

  const beneficiaryAccount: Record<string, unknown> = {
    type,
    country,
    currency,
    first_name: validated.first_name ?? "",
    middle_name: validated.middle_name ?? "",
    last_name: validated.last_name ?? "",
    email: validated.email ?? "",
    mobile_country_code: validated.mobile_country_code ?? "",
    mobile: validated.mobile ?? "",
    payment_rail: validated.payment_rail ?? "",
    service_bank: serviceBankBankId ?? "",
    bank_name: serviceBankName ?? validated.bank_name ?? "",
    routing_number: validated.routing_number ?? validated.code ?? "",
    account_name: accountName,
    account_number: validated.account_number ?? "",
    account_type: validated.account_type ?? "",
    swift_code: swiftCode ?? "",
    iban: validated.iban ?? validated.account_number ?? "",
    intermediary_bank_swift_code: validated.intermediary_bank_swift_code ?? "",
    intermediary_bank_name: validated.intermediary_bank_name ?? "",
    intermediary_bank_aba: validated.intermediary_bank_aba ?? "",
    intermediary_bank_address: validated.intermediary_bank_address ?? "",
    intermediary_bank_city: validated.intermediary_bank_city ?? "",
    intermediary_bank_state: validated.intermediary_bank_state ?? "",
    intermediary_bank_postal_code: validated.intermediary_bank_postal_code ?? "",
    intermediary_bank_country: validated.intermediary_bank_country ?? "",
    bank_country: validated.bank_country ?? country,
    business_name: validated.business_name ?? "",
    business_country: validated.business_country ?? "",
  };

  const beneficiaryAccountAdditionalDetail: Record<string, unknown> = {
    address_type: validated.address_type ?? "PRESENT",
    address_line1: validated.receiver_address_line_1 ?? "",
    address_line2: validated.receiver_address_line_2 ?? "",
    postal_code: validated.receiver_postal_code ?? "",
    city: validated.receiver_city ?? "",
    state: validated.receiver_state ?? "",
    country: validated.receiver_country ?? country,
    payment_type: validated.payment_type ?? "",
    bank_address_line1: validated.bank_address_line_1 ?? "",
    bank_address_line2: validated.bank_address_line_2 ?? "",
    bank_postal_code: validated.bank_postal_code ?? "",
    bank_city: validated.bank_city ?? "",
    bank_state: validated.bank_state ?? "",
    bank_country: validated.bank_country ?? country,
    purpose_of_transaction: validated.purpose_of_transaction ?? "",
    user_source_of_income: validated.source_of_funds ?? "",
  };

  return { beneficiaryAccount, beneficiaryAccountAdditionalDetail };
}
