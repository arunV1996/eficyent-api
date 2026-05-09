import { BeneficiaryAccount, BeneficiaryAdditionalDetail } from "@prisma/client";

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryAccountResource. Field set
 * preserved as-is so the frontend sees no change.
 */

export interface BeneficiaryAccountDto {
  unique_id: string;
  type: number | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  business_name: string | null;
  business_country: string | null;
  email: string | null;
  mobile_country_code: string | null;
  mobile: string | null;
  country: string;
  currency: string;
  payment_rail: string | null;
  service_bank: string | null;
  bank_name: string | null;
  routing_number: string | null;
  account_name: string | null;
  account_number: string | null;
  account_type: string | null;
  swift_code: string | null;
  iban: string | null;
  intermediary_bank_name: string | null;
  intermediary_bank_swift_code: string | null;
  intermediary_bank_aba: string | null;
  intermediary_bank_address: string | null;
  intermediary_bank_city: string | null;
  intermediary_bank_state: string | null;
  intermediary_bank_postal_code: string | null;
  intermediary_bank_country: string | null;
  bank_country: string | null;
  status: number;
  created_at: string;
  additional_details?: {
    address_type: string | null;
    address_line1: string | null;
    address_line2: string | null;
    postal_code: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    bank_address_line1: string | null;
    bank_address_line2: string | null;
    bank_postal_code: string | null;
    bank_city: string | null;
    bank_state: string | null;
    bank_country: string | null;
    purpose_of_transaction: string | null;
    user_source_of_income: string | null;
  };
}

export function beneficiaryAccountResource(
  account: BeneficiaryAccount & {
    additionalDetails?: BeneficiaryAdditionalDetail | null;
  },
): BeneficiaryAccountDto {
  const dto: BeneficiaryAccountDto = {
    unique_id: account.uniqueId,
    type: account.type,
    first_name: account.firstName,
    middle_name: account.middleName,
    last_name: account.lastName,
    business_name: account.businessName,
    business_country: account.businessCountry,
    email: account.email,
    mobile_country_code: account.mobileCountryCode,
    mobile: account.mobile,
    country: account.country,
    currency: account.currency,
    payment_rail: account.paymentRail,
    service_bank: account.serviceBank,
    bank_name: account.bankName,
    routing_number: account.routingNumber,
    account_name: account.accountName,
    account_number: account.accountNumber,
    account_type: account.accountType,
    swift_code: account.swiftCode,
    iban: account.iban,
    intermediary_bank_name: account.intermediaryBankName,
    intermediary_bank_swift_code: account.intermediaryBankSwiftCode,
    intermediary_bank_aba: account.intermediaryBankAba,
    intermediary_bank_address: account.intermediaryBankAddress,
    intermediary_bank_city: account.intermediaryBankCity,
    intermediary_bank_state: account.intermediaryBankState,
    intermediary_bank_postal_code: account.intermediaryBankPostalCode,
    intermediary_bank_country: account.intermediaryBankCountry,
    bank_country: account.bankCountry,
    status: account.status,
    created_at: account.createdAt ? account.createdAt.toISOString() : "",
  };
  if (account.additionalDetails) {
    dto.additional_details = {
      address_type: account.additionalDetails.addressType,
      address_line1: account.additionalDetails.addressLine1,
      address_line2: account.additionalDetails.addressLine2,
      postal_code: account.additionalDetails.postalCode,
      city: account.additionalDetails.city,
      state: account.additionalDetails.state,
      country: account.additionalDetails.country,
      bank_address_line1: account.additionalDetails.bankAddressLine1,
      bank_address_line2: account.additionalDetails.bankAddressLine2,
      bank_postal_code: account.additionalDetails.bankPostalCode,
      bank_city: account.additionalDetails.bankCity,
      bank_state: account.additionalDetails.bankState,
      bank_country: account.additionalDetails.bankCountry,
      purpose_of_transaction: account.additionalDetails.purposeOfTransaction,
      user_source_of_income: account.additionalDetails.userSourceOfIncome,
    };
  }
  return dto;
}
