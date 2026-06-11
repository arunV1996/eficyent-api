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

export async function shapeDocument(doc: UserDocument): Promise<Record<string, unknown>> {
  let signedFile = doc.documentFile ?? "";
  let signedBackFile = doc.documentBackFile ?? "";
  try {
    const { s3Service } = await import("../services/storage/s3Service");
    if (doc.documentFile) signedFile = await s3Service.temporaryUrl(doc.documentFile);
    if (doc.documentBackFile) signedBackFile = await s3Service.temporaryUrl(doc.documentBackFile);
  } catch {
    // fallback
  }
  return {
    document_name: doc.documentName ?? "",
    document_type: doc.documentType ?? "",
    document_country: doc.documentCountry ?? "",
    document_file: signedFile,
    document_back_file: signedBackFile,
    document_expiry_date: doc.documentExpiryDate
      ? doc.documentExpiryDate.toISOString().split("T")[0]
      : "",
  };
}

async function formatBusinessPersons(
  businessPersons: any
): Promise<any[]> {
  if (!Array.isArray(businessPersons)) return [];
  const { lookupsService } = await import("../services/lookups/lookupsService");
  const { LOOKUP_TYPE_ID_TYPE } = await import("./constants");
  const { getStateName } = await import("./lookups");
  return Promise.all(
    businessPersons.map(async (person: any) => {
      if (person && typeof person === "object") {
        const idTypeFormatted = person.id_type
          ? await lookupsService.findValuebyKey(person.id_type, LOOKUP_TYPE_ID_TYPE)
          : "";
        const stateFormatted = person.state
          ? await getStateName(person.state, person.country)
          : "";
        return {
          ...person,
          id_type: idTypeFormatted || String(person.id_type || ""),
          state: stateFormatted || String(person.state || ""),
        };
      }
      return person;
    })
  );
}

export function genderFormatted(gender: string | null | undefined): string {
  if (!gender) return "";
  const g = gender.toLowerCase().trim();
  if (g === "male" || g === "1") return "Male";
  if (g === "female" || g === "2") return "Female";
  if (g === "others" || g === "3") return "Others";
  return gender;
}

export async function shapeUserInfo(
  user: User,
  info: UserInformation | null,
): Promise<{ business_information?: any; user_information?: any }> {
  const { lookupsService } = await import("../services/lookups/lookupsService");
  const { getStateName } = await import("./lookups");

  if (Number(user.userType) === USER_TYPE_BUSINESS) {
    const typeOfBusinessFormatted = info?.type_of_business
      ? await lookupsService.findValuebyKey(info.type_of_business)
      : "";
    const stateFormatted = info?.state
      ? await getStateName(info.state, info.country)
      : "";

    return {
      business_information: {
        legal_name: info?.legalName ?? "",
        country_of_incorporation: info?.country_of_incorporation ?? "",
        formation_date: info?.formationDate
          ? info.formationDate.toISOString().split("T")[0]
          : "",
        business_name: info?.businessName ?? "",
        address_line_1: info?.address1 ?? "",
        address_line_2: info?.address2 ?? "",
        city: info?.city ?? "",
        state: stateFormatted,
        country: info?.country ?? "",
        postal_code: info?.postalCode ?? "",
        purpose_of_transactions: info?.purposeOfTransactions ?? "",
        tax_id: info?.taxId ?? "",
        website: info?.website ?? "",
        business_persons: await formatBusinessPersons(info?.businessPersons),
        type_of_business: typeOfBusinessFormatted,
      },
    };
  } else {
    const stateFormatted = info?.state
      ? await getStateName(info.state, info.country)
      : "";
    const professionFormatted = info?.profession
      ? await lookupsService.findValuebyKey(info.profession)
      : "";
    const sourceOfIncomeFormatted = info?.sourceOfIncome
      ? await lookupsService.findValuebyKey(info.sourceOfIncome)
      : "";

    return {
      user_information: {
        title: user.title ?? "",
        first_name: user.firstName ?? "",
        middle_name: user.middleName ?? "",
        last_name: user.lastName ?? "",
        dob: user.dob ? user.dob.toISOString().split("T")[0] : "",
        gender: genderFormatted(user.gender),
        address_line_1: info?.address1 ?? "",
        address_line_2: info?.address2 ?? "",
        city: info?.city ?? "",
        state: stateFormatted,
        country: info?.country ?? "",
        postal_code: info?.postalCode ?? "",
        purpose_of_transactions: info?.purposeOfTransactions ?? "",
        id_type: info?.idType ?? "",
        id_number: info?.idNumber ?? "",
        profession: professionFormatted,
        source_of_income: sourceOfIncomeFormatted,
      },
    };
  }
}

export async function shapeFullUser(
  user: User,
  info: UserInformation | null,
  docs: UserDocument[] = [],
  isMerchant: boolean = false,
  businessModel: string = "mto",
): Promise<Record<string, unknown>> {
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

  const infoShaped = await shapeUserInfo(user, info);
  Object.assign(result, infoShaped);

  result["documents"] = await Promise.all(docs.map(shapeDocument));
  result["role"] = roleLabel(user.userRole);
  result["is_merchant"] = yesNo(isMerchant);
  result["business_model"] = businessModel;

  return result;
}

export async function shapeOnboardingUser(
  user: User,
  info: UserInformation | null,
): Promise<Record<string, unknown>> {
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

  const infoShaped = await shapeUserInfo(user, info);
  Object.assign(result, infoShaped);

  return result;
}

export async function shapeDocumentsUser(
  user: User,
  docs: UserDocument[],
): Promise<Record<string, unknown>> {
  return {
    onboarding_step: onboardingLabel(user.onboardingStep),
    documents: await Promise.all(docs.map(shapeDocument)),
  };
}

export function shapeStatusUser(
  user: User,
  isMerchant: boolean,
  info: UserInformation | null = null,
  businessModel: string = "mto",
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
    business_model: businessModel.toLowerCase(),
  };
}
