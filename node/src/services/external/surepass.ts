import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Services\\Surepass\\* - bank-account validation provider
 * (alternative to ProcessingUnit's validate-account flow). Auth: bearer
 * token configured in the secret bundle.
 *
 * Surepass also has a KYC product but it's not currently wired into the
 * Laravel KYC factory - we ship the validation client only and leave the
 * KYC piece for when the upstream product is enabled.
 */

interface SurepassSecret extends Record<string, unknown> {
  URL: string;
  AUTH_TOKEN: string;
  BANK_VERIFICATION_ENDPOINT: string;
  TIMEOUT_SEC?: number;
  IS_SANDBOX?: boolean;
}

let cachedSecret: SurepassSecret | null = null;
async function loadSecret(): Promise<SurepassSecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<SurepassSecret>("surepass");
  return cachedSecret;
}

interface SurepassResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
}

class SurepassValidationDriver {
  async validateBankAccount(payload: {
    account_number: string;
    ifsc: string;
  }): Promise<SurepassResponse<Record<string, unknown>>> {
    try {
      const secret = await loadSecret();
      const res = await call<{ success?: boolean; data?: Record<string, unknown>; message?: string }>(
        { provider: "surepass", callFor: "create" },
        {
          method: "POST",
          baseUrl: secret.URL,
          path: secret.BANK_VERIFICATION_ENDPOINT,
          body: payload,
          headers: { Authorization: `Bearer ${secret.AUTH_TOKEN}` },
          timeoutMs: (secret.TIMEOUT_SEC ?? 30) * 1000,
        },
      );
      return {
        success: res.body?.success === true,
        message: res.body?.message ?? "",
        data: (res.body?.data ?? null) as Record<string, unknown> | null,
      };
    } catch (err) {
      logger.error({ err }, "Surepass.validateBankAccount threw");
      return { success: false, message: String(err), data: null };
    }
  }
}

export const Surepass = new SurepassValidationDriver();
