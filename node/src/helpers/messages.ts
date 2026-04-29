/**
 * Mirror of Laravel's api_error() / api_success() lookup tables.
 * Codes match the originals so existing API consumers see no change.
 *
 * Source: Laravel/lang/en/messages.php (or wherever api_error/api_success
 * resolves). The full table is ported as additional codes are needed by
 * each module conversion.
 */

export const ApiSuccessMessages: Record<number, string> = {
  101: "Registration successful. Please verify your email.",
  102: "Email verified successfully.",
  103: "Verification code resent.",
  104: "Login successful.",
  105: "Logout successful.",
  106: "Onboarding step completed.",
  109: "Reset password link sent to your email.",
  110: "Verification code verified.",
  111: "Password reset successful.",
  113: "Account validation completed.",
};

export const ApiErrorMessages: Record<number, string> = {
  102: "User not found.",
  103: "Invalid OTP.",
  104: "OTP has expired.",
  106: "Email already verified.",
  107: "Email not verified.",
  108: "Invalid onboarding step.",
  113: "Onboarding service is not supported.",
  115: "Account already activated for this provider.",
  116: "Virtual account not found.",
  117: "Failed to create beneficiary account.",
  118: "Beneficiary account not found.",
  158: "Beneficiary account already exists.",
  179: "Failed to create account validation record.",
  195: "C2B (consumer to business) is not supported.",
  109: "File upload failed.",
  110: "Missing X-Api-Key header.",
  111: "Missing X-Api-Signature header.",
  112: "Signature verification failed.",
  114: "Onboarding not completed.",
  125: "Invalid email or password.",
  126: "New password cannot be the same as old password.",
  127: "Failed to update password.",
  128: "Invalid reset token.",
  129: "Request timestamp expired.",
  133: "Only business users can access this resource.",
  134: "Too many invalid attempts. Please try again later.",
  136: "Subuser not found.",
  138: "Two-factor authentication is not configured.",
  139: "Invalid verification code.",
  140: "Two-factor authentication is not enabled for this account.",
  141: "Reset token has expired.",
  142: "Invalid verification code.",
  144: "Invalid invite token.",
  145: "Invite link expired.",
  146: "Invite already accepted.",
  148: "Tour status already updated.",
  151: "Invalid merchant.",
  163: "Refund could not be created.",
  164: "Static page not found.",
  188: "Cannot specify both refresh_all and currency.",
  189: "FX rate not available.",
  192: "X-User-Id header required.",
  193: "User not found for the merchant.",
  194: "User type not supported by merchant.",

  // Idempotency / payout
  400: "Bad request.",
  401: "Unauthenticated.",
  403: "Forbidden.",
  404: "Not found.",
  409: "Idempotency key conflict: a different request was already processed under this key.",
  422: "Validation error.",
  429: "Too many requests.",
  500: "Internal server error.",
};

export function apiSuccess(code: number): string {
  return ApiSuccessMessages[code] ?? "OK";
}
export function apiError(code: number): string {
  return ApiErrorMessages[code] ?? "Error";
}
