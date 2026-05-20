import { BeneficiaryAccount, BeneficiaryAdditionalDetail } from "@prisma/client";
import { formatDate } from "../../helpers/lookups";
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
  account_number: string | null;
  swift_code: string | null;
  iban: string | null;
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
  } | Record<string, never>;
  created_at: string;
  account_name: string | null;
  // Conditional fields (returned as null if not applicable to the type)
  email?: string | null;
  mobile_country_code?: string | null;
  mobile?: string | null;
  bank_name?: string | null;
  account_type?: string | null;
  intermediary_bank_name?: string | null;
  business_name?: string | null;
  business_country?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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

  const dto: BeneficiaryAccountDto = {
    unique_id: account.uniqueId,
    country: account.country,
    currency: account.currency,
    type: isBusiness ? "BUSINESS" : "PERSONAL",
    account_number: account.accountNumber,
    swift_code: account.swiftCode,
    iban: account.iban,
    bank_country: account.bankCountry,
    purpose_of_transaction: detail?.purposeOfTransaction ?? null,
    status: statusLabel,
    additional_details: detail
      ? {
          recipient_address: {
            address_line1: detail.addressLine1,
            address_line2: detail.addressLine2,
            city: detail.city,
            state: detail.state,
            postal_code: detail.postalCode,
            country: detail.country,
          },
          bank_address: {
            address_line1: detail.bankAddressLine1,
            address_line2: detail.bankAddressLine2,
            city: detail.bankCity,
            state: detail.bankState,
            postal_code: detail.bankPostalCode,
            country: detail.bankCountry,
          },
        }
      : {},
    created_at: formatDate(account.createdAt),
    account_name: account.accountName,
  };

  // Add type-specific fields. 
  // In legacy, many keys were omitted from the JSON if they didn't apply to the type.
  if (isBusiness) {
    dto.email = account.email;
    dto.mobile_country_code = account.mobileCountryCode;
    dto.mobile = account.mobile;
    dto.bank_name = account.bankName;
    dto.account_type = account.accountType;
    dto.intermediary_bank_name = account.intermediaryBankName;
    dto.business_name = account.businessName;
    dto.business_country = account.businessCountry;
  } else {
    dto.first_name = account.firstName;
    dto.last_name = account.lastName;
  }

  return dto;
}
