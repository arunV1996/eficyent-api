import { User, UserInformation, UserDocument } from "@prisma/client";
import { USER_TYPE_BUSINESS } from "./constants";

export function yesNo(val: number | boolean | null): string {
  if (typeof val === "boolean") return val ? "YES" : "NO";
  return val === 1 ? "YES" : "NO";
}

export function onboardingLabel(step: number | bigint): string {
  switch (Number(step)) {
    case 1: return "REGISTERED";
    case 2: return "INFORMATION_UPDATED";
    case 3: return "DOCUMENTS_UPLOADED";
    case 4: return "ONBOARDING_COMPLETED";
    default: return "REGISTERED";
  }
}

export function verificationLabel(status: number): string {
  switch (status) {
    case 1: return "PENDING";
    case 2: return "INITIATED";
    case 3: return "PROCESSING";
    case 4: return "FAILED";
    case 5: return "COMPLETED";
    default: return "PENDING";
  }
}

export function tourLabel(status: number): string {
  return status === 1 ? "COMPLETED" : "PENDING";
}

export function roleLabel(role: number | bigint | null): string {
  if (role === null) return "ADMIN";
  switch (Number(role)) {
    case 1:
      return "ADMIN";
    case 2:
      return "OWNER";
    case 3:
      return "TEAM_MEMBER";
    case 4:
      return "CORPORATE";
    default:
      return "ADMIN";
  }
}

function shapeDocument(doc: UserDocument): Record<string, unknown> {
  return {
    document_name: doc.documentName ?? "",
    document_type: doc.documentType ?? "",
    document_country: doc.documentCountry ?? "",
    document_file: doc.documentFile ?? "",
    document_back_file: doc.documentBackFile ?? "",
    document_expiry_date: doc.documentExpiryDate
      ? doc.documentExpiryDate.toISOString().split("T")[0]
      : "",
  };
}

export function shapeFullUser(
  user: User,
  info: UserInformation | null,
  docs: UserDocument[] = [],
  isMerchant: boolean = false,
  businessModel: string = "MTO",
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    unique_id: user.uniqueId,
    email: user.email,
    mobile_country_code: user.mobileCountryCode ?? "",
    mobile: user.mobile ?? "",
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
    user_type: Number(user.userType) === USER_TYPE_BUSINESS ? "BUSINESS" : "PERSONAL",
    onboarding_step: onboardingLabel(user.onboardingStep),
    id_verification: verificationLabel(user.idVerification),
    sender_enabled: yesNo(user.enableSender),
    is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
    is_tfa_enabled: yesNo(user.isTfaEnabled),
    tour_status: tourLabel(user.tourStatus),
  };

  if (Number(user.userType) === USER_TYPE_BUSINESS) {
    result["business_information"] = {
      legal_name: info?.legalName ?? "",
      country_of_incorporation: info?.country_of_incorporation ?? "",
      formation_date: info?.formationDate
        ? info.formationDate.toISOString().split("T")[0]
        : "",
      business_name: info?.businessName ?? "",
      address_line_1: info?.address1 ?? "",
      address_line_2: info?.address2 ?? "",
      city: info?.city ?? "",
      state: info?.state ?? "",
      country: info?.country ?? "",
      postal_code: info?.postalCode ?? "",
      purpose_of_transactions: info?.purposeOfTransactions ?? "",
      tax_id: info?.taxId ?? "",
      website: info?.website ?? "",
      business_persons: info?.businessPersons ?? [],
      type_of_business: info?.type_of_business ?? "",
    };
  } else {
    result["user_information"] = {
      title: user.title ?? "",
      first_name: user.firstName ?? "",
      middle_name: user.middleName ?? "",
      last_name: user.lastName ?? "",
      dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
      gender: user.gender ?? "",
      address_line_1: info?.address1 ?? "",
      address_line_2: info?.address2 ?? "",
      city: info?.city ?? "",
      state: info?.state ?? "",
      country: info?.country ?? "",
      postal_code: info?.postalCode ?? "",
      purpose_of_transactions: info?.purposeOfTransactions ?? "",
      id_type: info?.idType ?? "",
      id_number: info?.idNumber ?? "",
      profession: info?.profession ?? "",
      source_of_income: info?.sourceOfIncome ?? "",
    };
  }

  result["documents"] = docs.map(shapeDocument);
  result["role"] = roleLabel(user.userRole);
  result["is_merchant"] = yesNo(isMerchant);
  result["business_model"] = businessModel;

  return result;
}

export function shapeOnboardingUser(
  user: User,
  info: UserInformation | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    unique_id: user.uniqueId,
    title: user.title,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    mobile_country_code: user.mobileCountryCode ?? "",
    mobile: user.mobile ?? "",
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
    user_type: Number(user.userType) === USER_TYPE_BUSINESS ? "BUSINESS" : "PERSONAL",
    dob: user.dob ? user.dob.toISOString().split("T")[0] : null,
    onboarding_step: onboardingLabel(user.onboardingStep),
    id_verification: verificationLabel(user.idVerification),
  };

  if (Number(user.userType) === USER_TYPE_BUSINESS) {
    result["business_information"] = {
      legal_name: info?.legalName ?? "",
      country_of_incorporation: info?.country_of_incorporation ?? "",
      formation_date: info?.formationDate
        ? info.formationDate.toISOString().split("T")[0]
        : "",
      business_name: info?.businessName ?? "",
      address_line_1: info?.address1 ?? "",
      address_line_2: info?.address2 ?? "",
      city: info?.city ?? "",
      state: info?.state ?? "",
      country: info?.country ?? "",
      postal_code: info?.postalCode ?? "",
      purpose_of_transactions: info?.purposeOfTransactions ?? "",
      tax_id: info?.taxId ?? "",
      website: info?.website ?? "",
      business_persons: info?.businessPersons ?? [],
      type_of_business: info?.type_of_business ?? "",
    };
  } else {
    result["user_information"] = {
      title: user.title ?? "",
      first_name: user.firstName ?? "",
      middle_name: user.middleName ?? "",
      last_name: user.lastName ?? "",
      dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
      gender: user.gender ?? "",
      address_line_1: info?.address1 ?? "",
      address_line_2: info?.address2 ?? "",
      city: info?.city ?? "",
      state: info?.state ?? "",
      country: info?.country ?? "",
      postal_code: info?.postalCode ?? "",
      purpose_of_transactions: info?.purposeOfTransactions ?? "",
      id_type: info?.idType ?? "",
      id_number: info?.idNumber ?? "",
      profession: info?.profession ?? "",
      source_of_income: info?.sourceOfIncome ?? "",
    };
  }

  return result;
}

export function shapeDocumentsUser(
  user: User,
  docs: UserDocument[],
): Record<string, unknown> {
  return {
    onboarding_step: onboardingLabel(user.onboardingStep),
    documents: docs.map(shapeDocument),
  };
}

export function shapeStatusUser(
  user: User,
  isMerchant: boolean,
  info: UserInformation | null = null,
  businessModel: string = "MTO",
): Record<string, unknown> {
  let name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  if (Number(user.userType) === USER_TYPE_BUSINESS && info) {
    name = info.legalName || info.businessName || name;
  }

  return {
    name,
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
    id_verification: verificationLabel(user.idVerification),
    is_merchant: yesNo(isMerchant),
    is_tfa_enabled: yesNo(user.isTfaEnabled),
    is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
    onboarding_step: onboardingLabel(user.onboardingStep),
    role: roleLabel(user.userRole),
    sender_enabled: yesNo(user.enableSender),
    tour_status: tourLabel(user.tourStatus),
    user_type: Number(user.userType) === USER_TYPE_BUSINESS ? "BUSINESS" : "PERSONAL",
    business_model: businessModel,
  };
}
