import { User, UserInformation, UserDocument } from "@prisma/client";
import {
  onboardingLabel,
  verificationLabel,
  yesNo,
  tourLabel,
  shapeUserInfo,
  shapeDocument,
} from "../../helpers/userShaper";
import {
  METHOD_REGISTER,
  METHOD_VERIFY_EMAIL,
  METHOD_LOGIN,
  METHOD_GET_CREDENTIALS,
  METHOD_PROFILE,
  METHOD_ONBOARDING_STEP_TWO,
  METHOD_ONBOARDING_STEP_THREE,
  METHOD_USER_STATUS,
  METHOD_SUBUSER,
} from "../../helpers/constants";

/**
 * Mirror of App\\Http\\Resources\\UserResource. Field set + key naming
 * preserved as-is so the frontend sees no change.
 *
 * `method` is one of METHOD_LOGIN, METHOD_REGISTER, METHOD_VERIFY_EMAIL,
 * METHOD_PROFILE, METHOD_GET_CREDENTIALS, METHOD_USER_STATUS, METHOD_SUBUSER.
 * The original UserResource branched on it to omit/include certain fields;
 * we keep the same pattern.
 */

export async function userResource(
  user: User & {
    userInformation?: UserInformation | null;
    userDocuments?: UserDocument[];
  },
  method: string,
): Promise<Record<string, any>> {
  const emailStatus = user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED";
  const userType = Number(user.userType) === 2 ? "BUSINESS" : "PERSONAL";

  switch (method) {
    case METHOD_REGISTER:
      return {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: emailStatus,
        user_type: userType,
        role: "ADMIN",
      };

    case METHOD_VERIFY_EMAIL:
      return {
        unique_id: user.uniqueId,
        email: user.email,
        email_status: emailStatus,
      };

    case METHOD_LOGIN:
      return {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: emailStatus,
        user_type: userType,
        is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
        is_tfa_enabled: yesNo(user.isTfaEnabled),
        role: "ADMIN",
      };

    case METHOD_GET_CREDENTIALS: {
      const { decryptEnvelope } = await import("../../config/kms");
      return {
        unique_id: user.uniqueId,
        api_key: user.apiKey ?? "",
        salt_key: user.saltKey ? await decryptEnvelope(user.saltKey) : "",
        private_key: user.privateKey ? await decryptEnvelope(user.privateKey) : "",
      };
    }

    case METHOD_PROFILE: {
      const infoShaped = await shapeUserInfo(user, user.userInformation || null);
      const docsShaped = user.userDocuments
        ? await Promise.all(user.userDocuments.map(shapeDocument))
        : [];
      return {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: emailStatus,
        user_type: userType,
        onboarding_step: onboardingLabel(user.onboardingStep),
        id_verification: verificationLabel(user.idVerification),
        sender_enabled: yesNo(user.enableSender),
        is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
        is_tfa_enabled: yesNo(user.isTfaEnabled),
        tour_status: tourLabel(user.tourStatus),
        ...infoShaped,
        documents: docsShaped,
        role: "ADMIN",
        is_merchant: user.merchantId ? "YES" : "NO",
      };
    }

    case METHOD_ONBOARDING_STEP_TWO: {
      const infoShaped = await shapeUserInfo(user, user.userInformation || null);
      return {
        unique_id: user.uniqueId,
        title: user.title ?? "",
        first_name: user.firstName ?? "",
        last_name: user.lastName ?? "",
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: emailStatus,
        user_type: userType,
        dob: user.dob ? user.dob.toISOString().split("T")[0] : null,
        onboarding_step: onboardingLabel(user.onboardingStep),
        id_verification: verificationLabel(user.idVerification),
        ...infoShaped,
      };
    }

    case METHOD_ONBOARDING_STEP_THREE: {
      const docsShaped = user.userDocuments
        ? await Promise.all(user.userDocuments.map(shapeDocument))
        : [];
      return {
        onboarding_step: onboardingLabel(user.onboardingStep),
        documents: docsShaped,
      };
    }

    case METHOD_USER_STATUS: {
      const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
      const legalOrName = Number(user.userType) === 2 && user.userInformation?.legalName
        ? user.userInformation.legalName
        : name;
      return {
        name: legalOrName,
        email_status: emailStatus,
        id_verification: verificationLabel(user.idVerification),
        is_merchant: user.merchantId ? "YES" : "NO",
        is_tfa_enabled: yesNo(user.isTfaEnabled),
        is_tfa_setup_completed: yesNo(user.isTfaSetupCompleted),
        onboarding_step: onboardingLabel(user.onboardingStep),
        role: "ADMIN",
        sender_enabled: yesNo(user.enableSender),
        tour_status: tourLabel(user.tourStatus),
        user_type: userType,
      };
    }

    case METHOD_SUBUSER:
      return {
        unique_id: user.uniqueId,
        title: user.title ?? "",
        first_name: user.firstName ?? "",
        last_name: user.lastName ?? "",
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        onboarding_step: onboardingLabel(user.onboardingStep),
        id_verification: verificationLabel(user.idVerification),
        email_status: emailStatus,
      };

    default:
      return {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
      };
  }
}

/**
 * Mirror of App\\Http\\Resources\\SubUserResource. Subuser DTOs are a
 * stripped-down view of a User row.
 */
export interface SubUserResourceShape {
  unique_id: string;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  mobile_country_code: string | null;
  mobile: string | null;
  onboarding_step: string;
  id_verification: string;
  email_status: string;
}

export function subUserResource(user: User): SubUserResourceShape {
  return {
    unique_id: user.uniqueId,
    title: user.title,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    onboarding_step: onboardingLabel(user.onboardingStep),
    id_verification: verificationLabel(user.idVerification),
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
  };
}
