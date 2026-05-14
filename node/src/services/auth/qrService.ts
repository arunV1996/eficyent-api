import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

/**
 * Build the otpauth:// URL the way Google Authenticator expects.
 * To preserve API parity with Laravel, we also provide a method to render
 * the URL as an inline SVG string.
 */


export const qrService = {
  totpUri(secretBase32: string, accountLabel: string, issuer: string): string {
    const totp = new TOTP({
      issuer,
      label: accountLabel,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    return totp.toString();
  },

  async generateSvg(uri: string): Promise<string> {
    return QRCode.toString(uri, { type: "svg", width: 200, margin: 2 });
  },
};
