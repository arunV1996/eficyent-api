import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";

/**
 * TOTP provisioning helpers (mirror of the legacy qrService): the
 * otpauth:// URI in the exact shape Google Authenticator expects, and
 * a base64 PNG data URL the frontend can drop into an <img>.
 */

export const totpUri = (
    secretBase32: string,
    accountLabel: string,
    issuer: string,
): string => {
    const totp = new TOTP({
        issuer,
        label: accountLabel,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secretBase32),
    });
    return totp.toString();
};

export const generateQrDataUrl = async (uri: string): Promise<string> => {
    return QRCode.toDataURL(uri, {
        type: "image/png",
        width: 200,
        margin: 2,
    });
};
