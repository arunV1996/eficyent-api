import { Secret, TOTP } from "otpauth";

/**
 * Build the otpauth:// URL the way Google Authenticator expects. We don't
 * render a QR code server-side here - the frontend can render it client-side
 * using any QR library, which keeps server CPU costs low at 1M-user scale.
 *
 * Laravel's setup_tfa returned both `qr_code` (inline SVG) and `qr_code_url`
 * (otpauth://). To preserve API parity we keep both keys but use a hosted
 * QR rendering service for the inline string. If you'd rather render
 * server-side, swap in `qrcode` (npm) - the function signature is unchanged.
 */

const ISSUER = "Eficyent";

export const qrService = {
  totpUri(secretBase32: string, accountLabel: string): string {
    const totp = new TOTP({
      issuer: ISSUER,
      label: accountLabel,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    return totp.toString();
  },
};
