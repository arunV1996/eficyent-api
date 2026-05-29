import { BeneficiaryAccount, BeneficiaryAdditionalDetail } from "@prisma/client";
import { formatDate, findValueByKeySync } from "../../helpers/lookups";
import { BENEFICIARY_ACCOUNT_STATUS_MAP } from "../../helpers/constants";

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryAccountResource.
 * Optimized to match the exact JSON structure expected by existing integrations.
 * Supports both BUSINESS and PERSONAL types by providing a unified field set.
 */

export interface BeneficiaryAccountDto {
  unique_id: string;
  country: string;
  currency: string;
  type: string | null;
  email?: string | null;
  mobile_country_code?: string | null;
  mobile?: string | null;
  payment_rail?: string | null;
  bank_name?: string | null;
  routing_number?: string | null;
  account_number: string | null;
  swift_code: string | null;
  iban: string | null;
  bank_country: string | null;
  purpose_of_transaction: string | null;
  status: string;
  additional_details: any;
  created_at: string;
  account_name: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  business_country?: string | null;
}

export function filterEmptyValues(val: any): any {
  if (val === null || val === undefined) return undefined;
  if (Array.isArray(val)) {
    const filtered = val.map(v => filterEmptyValues(v)).filter(v => v !== undefined && v !== "");
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof val === "object" && !(val instanceof Date)) {
    const filtered: any = {};
    let hasKeys = false;
    for (const k of Object.keys(val)) {
      const v = filterEmptyValues(val[k]);
      if (v !== undefined && v !== "") {
        filtered[k] = v;
        hasKeys = true;
      }
    }
    return hasKeys ? filtered : undefined;
  }
  if (val === "") return undefined;
  return val;
}

export function beneficiaryAccountResource(
  account: BeneficiaryAccount & {
    additionalDetails?: BeneficiaryAdditionalDetail[] | BeneficiaryAdditionalDetail | null;
  },
): BeneficiaryAccountDto {
  const statusLabel = Object.keys(BENEFICIARY_ACCOUNT_STATUS_MAP).find(
    (key) => BENEFICIARY_ACCOUNT_STATUS_MAP[key] === account.status,
  ) ?? "PENDING";

  // Normalize additionalDetails
  const detail = Array.isArray(account.additionalDetails)
    ? account.additionalDetails[0]
    : account.additionalDetails;

  const isBusiness = Number(account.type) === 2;

  const data: any = {
    unique_id: account.uniqueId ?? "",
    country: account.country ?? "",
    currency: account.currency ?? "",
    type: isBusiness ? "BUSINESS" : "PERSONAL",
    email: account.email ?? "",
    mobile_country_code: account.mobileCountryCode ?? "",
    mobile: account.mobile ?? "",
    payment_rail: account.paymentRail ?? "",
    bank_name: account.bankName ?? "",
    routing_number: account.routingNumber ?? "",
    account_number: account.accountNumber ?? "",
    account_type: account.accountType ?? "",
    swift_code: account.swiftCode ?? "",
    iban: account.iban ?? "",
    intermediary_bank_swift_code: account.intermediaryBankSwiftCode ?? "",
    intermediary_bank_name: account.intermediaryBankName ?? "",
    intermediary_bank_aba: account.intermediaryBankAba ?? "",
    intermediary_bank_address: account.intermediaryBankAddress ?? "",
    intermediary_bank_city: account.intermediaryBankCity ?? "",
    intermediary_bank_state: account.intermediaryBankState ?? "",
    intermediary_bank_postal_code: account.intermediaryBankPostalCode ?? "",
    intermediary_bank_country: account.intermediaryBankCountry ?? "",
    bank_country: account.bankCountry ?? "",
    user_source_of_income: detail?.userSourceOfIncome ? findValueByKeySync(detail.userSourceOfIncome) : "",
    purpose_of_transaction: detail?.purposeOfTransaction ? findValueByKeySync(detail.purposeOfTransaction) : "",
    status: statusLabel,
    additional_details: detail
      ? {
          recipient_address: {
            address_line1: detail.addressLine1 ?? "",
            address_line2: detail.addressLine2 ?? "",
            postal_code: detail.postalCode ?? "",
            city: detail.city ?? "",
            state: detail.state ?? "",
            country: detail.country ?? "",
          },
          bank_address: {
            address_line1: detail.bankAddressLine1 ?? "",
            address_line2: detail.bankAddressLine2 ?? "",
            postal_code: detail.bankPostalCode ?? "",
            city: detail.bankCity ?? "",
            state: detail.bankState ?? "",
            country: detail.bankCountry ?? "",
          },
        }
      : null,
    created_at: formatDate(account.createdAt),
  };

  if (!isBusiness) {
    data.first_name = account.firstName ?? "";
    data.middle_name = account.middleName ?? "";
    data.last_name = account.lastName ?? "";
    data.account_name = account.accountName || `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();
  } else {
    data.business_name = account.businessName ?? "";
    data.business_country = account.businessCountry ?? "";
    data.account_name = account.accountName ?? "";
  }

  // Filter empty values using the same recursive filterEmptyValues helper as Laravel
  return filterEmptyValues(data) ?? {};
}
