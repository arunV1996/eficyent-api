import { BeneficiaryAccount, BeneficiaryAdditionalDetail } from "@prisma/client";
import { formatDate } from "../../helpers/lookups";
import { BENEFICIARY_ACCOUNT_STATUS_MAP } from "../../helpers/constants";

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryAccountResource.
 * Optimized to match the exact JSON structure expected by existing integrations.
 */

export interface BeneficiaryAccountDto {
  unique_id: string;
  country: string;
  currency: string;
  type: string | null;
  email: string | null;
  mobile_country_code: string | null;
  mobile: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_type: string | null;
  swift_code: string | null;
  iban: string | null;
  intermediary_bank_name: string | null;
  bank_country: string | null;
  purpose_of_transaction: string | null;
  status: string;
  additional_details: {
    recipient_address: {
      address_line1: string | null;
      address_line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country: string | null;
    } | null;
    bank_address: {
      address_line1?: string | null;
      address_line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country: string | null;
    } | null;
  };
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  business_country: string | null;
  account_name: string | null;
}

export function beneficiaryAccountResource(
  account: BeneficiaryAccount & {
    additionalDetails?: BeneficiaryAdditionalDetail[] | BeneficiaryAdditionalDetail | null;
  },
): BeneficiaryAccountDto {
  const statusLabel = Object.keys(BENEFICIARY_ACCOUNT_STATUS_MAP).find(
    (key) => BENEFICIARY_ACCOUNT_STATUS_MAP[key] === account.status,
  ) ?? "PENDING";

  // Normalize additionalDetails (Prisma include can return array or single object depending on relation)
  const detail = Array.isArray(account.additionalDetails)
    ? account.additionalDetails[0]
    : account.additionalDetails;

  return {
    unique_id: account.uniqueId,
    country: account.country,
    currency: account.currency,
    type: Number(account.type) === 2 ? "BUSINESS" : "PERSONAL",
    email: account.email,
    mobile_country_code: account.mobileCountryCode,
    mobile: account.mobile,
    bank_name: account.bankName,
    account_number: account.accountNumber,
    account_type: account.accountType,
    swift_code: account.swiftCode,
    iban: account.iban,
    intermediary_bank_name: account.intermediaryBankName,
    bank_country: account.bankCountry,
    purpose_of_transaction: detail?.purposeOfTransaction ?? null,
    status: statusLabel,
    additional_details: {
      recipient_address: detail
        ? {
            address_line1: detail.addressLine1,
            address_line2: detail.addressLine2,
            city: detail.city,
            state: detail.state,
            postal_code: detail.postalCode,
            country: detail.country,
          }
        : null,
      bank_address: detail
        ? {
            address_line1: detail.bankAddressLine1,
            address_line2: detail.bankAddressLine2,
            city: detail.bankCity,
            state: detail.bankState,
            postal_code: detail.bankPostalCode,
            country: detail.bankCountry,
          }
        : null,
    },
    created_at: formatDate(account.createdAt),
    first_name: account.firstName,
    last_name: account.lastName,
    business_name: account.businessName,
    business_country: account.businessCountry,
    account_name: account.accountName,
  };
}
