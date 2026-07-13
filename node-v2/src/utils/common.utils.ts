import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { createHash, randomBytes } from "crypto";
import moment from "moment-timezone";

/**
 * Hashes a plain text password using argon2id.
 * Matches the algorithm used by the existing node/ project so existing
 * password hashes stored in the users table remain verifiable.
 */
export const hashPassword = async (password: string): Promise<string> => {
    return argonHash(password);
};

/**
 * Compares a plain text password with an argon2id hash.
 * Returns false if the stored hash cannot be parsed (invalid format,
 * legacy bcrypt hash, etc.) rather than throwing.
 */
export const comparePassword = async (
    password: string,
    storedHash: string,
): Promise<boolean> => {
    if (!storedHash) {
        return false;
    }
    try {
        return await argonVerify(storedHash, password);
    } catch {
        return false;
    }
};

/**
 * Generates an opaque Sanctum-style access token.
 *
 * The plaintext token is returned to the client and is never persisted;
 * only its SHA-256 fingerprint is stored in personal_access_tokens. This
 * matches the current /node behavior so existing client integrations
 * continue to work.
 */
export const generateAccessToken = (): {
    plaintextToken: string;
    tokenFingerprint: string;
} => {
    const plaintextToken = randomBytes(40).toString("hex");
    const tokenFingerprint = createHash("sha256")
        .update(plaintextToken)
        .digest("hex");
    return { plaintextToken, tokenFingerprint };
};

/**
 * Rebuilds the SHA-256 fingerprint from a plaintext token so we can
 * look it up in personal_access_tokens during authentication.
 */
export const fingerprintToken = (plaintextToken: string): string => {
    return createHash("sha256").update(plaintextToken).digest("hex");
};

/**
 * Generates a unique_id string of the requested length using
 * lowercase alphanumerics. Used for public-facing IDs on user rows.
 */
export const generateUniqueId = (length = 24): string => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let uniqueId = "";
    const bytes = randomBytes(length);
    for (let position = 0; position < length; position += 1) {
        uniqueId += alphabet[bytes[position] % alphabet.length];
    }
    return uniqueId;
};

/**
 * Formats a Date or ISO string as "12 Feb 2026 1:22 PM".
 */
export const formatDate = (
    date: Date | string | null | undefined,
    timezone = "UTC",
): string => {
    if (!date) {
        return "";
    }
    let resolvedTimezone = timezone;
    if (resolvedTimezone?.includes("Calcutta")) {
        resolvedTimezone = "Asia/Kolkata";
    }
    return moment.utc(date).tz(resolvedTimezone).format("D MMM YYYY h:mm A");
};
