import { Secret, TOTP } from "otpauth";
import { decryptEnvelope } from "./crypto.helper";

/**
 * Google Authenticator-compatible TOTP (mirror of the legacy
 * totpService): 6 digits, 30s period, SHA-1, +/-1 window. The stored
 * tfa_secret is Laravel-encrypted; we decrypt per verification.
 */

const buildTotp = (secretBase32: string): TOTP => {
    return new TOTP({
        issuer: "Eficyent",
        label: "Eficyent",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secretBase32),
    });
};

export const verifyTotp = async (
    encryptedSecret: string,
    code: string,
): Promise<boolean> => {
    if (!encryptedSecret) {
        return false;
    }
    const cleanedCode = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleanedCode)) {
        return false;
    }
    const secret = await decryptEnvelope(encryptedSecret);
    return buildTotp(secret).validate({ token: cleanedCode, window: 1 }) !== null;
};

export const generateTotpSecret = (): string => {
    return new Secret({ size: 20 }).base32;
};

/**
 * Mirror of Helper::checkBackupCode — codes are comma-joined; a match
 * consumes the code and returns the remaining CSV.
 */
export const checkBackupCode = (
    storedCsv: string | null,
    enteredCode: string,
): { ok: boolean; remaining?: string } => {
    if (!storedCsv) {
        return { ok: false };
    }
    const codes = storedCsv.split(",").filter(Boolean);
    const position = codes.indexOf(enteredCode);
    if (position === -1) {
        return { ok: false };
    }
    codes.splice(position, 1);
    return { ok: true, remaining: codes.join(",") };
};
