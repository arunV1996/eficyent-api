import { TOTP, Secret } from "otpauth";
import { decryptEnvelope } from "../../config/kms";
import { ApiException } from "../../helpers/errors";

/**
 * Google Authenticator-compatible TOTP, parity with Laravel's
 * pragmarx/google2fa implementation.
 *
 *   - 6-digit codes
 *   - 30-second period
 *   - SHA-1 (matches Google Authenticator default)
 *   - +/- 1 window tolerance for clock drift
 *
 * The user's tfa_secret column is envelope-encrypted under the KMS CMK.
 * We decrypt it on each verification - a small KMS hop. To reduce KMS load
 * at scale, consider caching the decrypted secret in the user's session
 * (already protected by Redis ACLs).
 */

const PERIOD = 30;
const DIGITS = 6;
const WINDOW = 1;

export const totpService = {
  async verify(encryptedSecret: string, code: string): Promise<boolean> {
    if (!encryptedSecret) {
      throw new ApiException(138);
    }
    const cleaned = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleaned)) return false;

    const secret = await decryptEnvelope(encryptedSecret);
    const totp = new TOTP({
      issuer: "Eficyent",
      label: "Eficyent",
      algorithm: "SHA1",
      digits: DIGITS,
      period: PERIOD,
      secret: Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: cleaned, window: WINDOW });
    return delta !== null;
  },

  generateSecret(): string {
    return new Secret({ size: 20 }).base32;
  },
};

/**
 * Mirror of Helper::checkBackupCode. Backup codes are stored comma-joined,
 * unencrypted (they're already one-time-use 6 digit codes - rotating the
 * underlying tfa_secret on first 2FA login provides defense in depth).
 */
export function checkBackupCode(
  storedCsv: string | null,
  enteredCode: string,
): { ok: boolean; remaining?: string } {
  if (!storedCsv) return { ok: false };
  const codes = storedCsv.split(",").filter(Boolean);
  const idx = codes.indexOf(enteredCode);
  if (idx === -1) return { ok: false };
  codes.splice(idx, 1);
  return { ok: true, remaining: codes.join(",") };
}
