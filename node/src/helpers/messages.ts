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
  104: "Login successful.",
  105: "Logout successful.",
  109: "Reset password link sent to your email.",
  110: "Verification code verified.",
  111: "Password reset successful.",
};

export const ApiErrorMessages: Record<number, string> = {
  102: "User not found.",
  125: "Invalid email or password.",
  128: "Invalid reset token.",
  134: "Too many invalid attempts. Please try again later.",
  138: "Two-factor authentication is not configured.",
  139: "Invalid verification code.",
  140: "Two-factor authentication is not enabled for this account.",
  141: "Reset token has expired.",
  142: "Invalid verification code.",
  151: "Invalid merchant.",
  163: "Refund could not be created.",
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
