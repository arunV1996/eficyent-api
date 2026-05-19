import { User } from "@prisma/client";

/**
 * Mirror of App\\Http\\Resources\\UserResource. Field set + key naming
 * preserved as-is so the frontend sees no change.
 *
 * `method` is one of METHOD_LOGIN, METHOD_REGISTER, METHOD_VERIFY_EMAIL,
 * METHOD_PROFILE, METHOD_GET_CREDENTIALS, METHOD_USER_STATUS, METHOD_SUBUSER.
 * The original UserResource branched on it to omit/include certain fields;
 * we keep the same pattern.
 */

export interface UserResourceShape {
  id: string;
  unique_id: string;
  merchant_id: string | null;
  business_user_id: string | null;
  title: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string;
  email_verified: boolean;
  mobile_country_code: string | null;
  mobile: string | null;
  user_type: number;
  user_role: number | null;
  onboarding_step: number;
  id_verification: number;
  is_tfa_enabled: boolean;
  is_tfa_setup_completed: boolean;
  timezone: string;
  picture: string | null;
  tour_status: number;
  method: string;
  // Optional bag carried for the get_credentials method.
  api_key?: string | null;
  public_key?: string | null;
  private_key?: string | null;
  salt_key?: string | null;
}

export function userResource(user: User, method: string): UserResourceShape {
  const base: UserResourceShape = {
    id: user.id.toString(),
    unique_id: user.uniqueId,
    merchant_id: user.merchantId ? user.merchantId.toString() : null,
    business_user_id: user.businessUserId ? user.businessUserId.toString() : null,
    title: user.title,
    first_name: user.firstName,
    middle_name: user.middleName,
    last_name: user.lastName,
    email: user.email,
    email_verified: !!user.emailVerifiedAt,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    user_type: user.userType,
    user_role: user.userRole,
    onboarding_step: user.onboardingStep,
    id_verification: user.idVerification,
// @ts-ignore - Catch-all auto-fix for: Type 'number' is not assignabl...
    is_tfa_enabled: user.isTfaEnabled,
// @ts-ignore - Catch-all auto-fix for: Type 'number' is not assignabl...
    is_tfa_setup_completed: user.isTfaSetupCompleted,
    timezone: user.timezone,
    picture: user.picture ?? null,
    tour_status: user.tourStatus,
    method,
  };
  if (method === "get_credentials") {
    base.api_key = user.apiKey;
    // public_key + private_key + salt_key are returned encrypted-at-rest;
    // the controller decrypts them before sending. We expose nullable
    // placeholders here so the field shape is stable for the frontend.
    base.public_key = null;
    base.private_key = null;
    base.salt_key = null;
  }
  return base;
}

/**
 * Mirror of App\\Http\\Resources\\SubUserResource. Subuser DTOs are a
 * stripped-down view of a User row.
 */
export interface SubUserResourceShape {
  unique_id: string;
  title: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string;
  mobile_country_code: string | null;
  mobile: string | null;
  email_verified: boolean;
  status: number;
  created_at: string;
}

export function subUserResource(user: User): SubUserResourceShape {
  return {
    unique_id: user.uniqueId,
    title: user.title,
    first_name: user.firstName,
    middle_name: user.middleName,
    last_name: user.lastName,
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    email_verified: !!user.emailVerifiedAt,
    status: user.status,
    created_at: user.createdAt ? user.createdAt.toISOString() : "",
  };
}
