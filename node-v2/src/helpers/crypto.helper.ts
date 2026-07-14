import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from "crypto";

/**
 * Laravel-compatible AES-256-CBC encryption (mirror of the legacy
 * config/kms.ts, which itself mirrors Illuminate\Encryption\Encrypter).
 * Values encrypted by Laravel or by the legacy /node service decrypt
 * here and vice versa — the shared secret is APP_KEY.
 */

const getAppKey = (): Buffer => {
    let appKey = process.env.APP_KEY ?? "";
    if (appKey.startsWith("base64:")) {
        appKey = appKey.slice(7);
    }
    if (!appKey) {
        throw new Error(
            "APP_KEY is not set - required for Laravel encryption/decryption.",
        );
    }
    const key = Buffer.from(appKey, "base64");
    if (key.length !== 32) {
        throw new Error("APP_KEY must be exactly 32 bytes for AES-256-CBC.");
    }
    return key;
};

export const encryptEnvelope = async (plaintext: string): Promise<string> => {
    const key = getAppKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);

    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    const ivBase64 = iv.toString("base64");

    // Laravel's HMAC covers iv + value.
    const mac = createHmac("sha256", key)
        .update(ivBase64 + ciphertext)
        .digest("hex");

    const payload = {
        iv: ivBase64,
        value: ciphertext,
        mac,
        tag: "", // Empty tag is expected by Laravel CBC mode.
    };

    return Buffer.from(JSON.stringify(payload)).toString("base64");
};

export const decryptEnvelope = async (payload: string): Promise<string> => {
    const key = getAppKey();
    const json = Buffer.from(payload, "base64").toString("utf8");

    let data: { iv?: string; value?: string; mac?: string };
    try {
        data = JSON.parse(json);
    } catch {
        throw new Error(
            "Payload is not a valid Laravel encrypter payload (bad JSON).",
        );
    }

    if (!data.iv || !data.value || !data.mac) {
        throw new Error("Malformed Laravel encryption payload.");
    }

    const expectedMac = Buffer.from(
        createHmac("sha256", key).update(data.iv + data.value).digest("hex"),
    );
    const providedMac = Buffer.from(data.mac);
    if (
        expectedMac.length !== providedMac.length ||
        !timingSafeEqual(expectedMac, providedMac)
    ) {
        throw new Error(
            "MAC validation failed - data was tampered with or APP_KEY is incorrect.",
        );
    }

    const iv = Buffer.from(data.iv, "base64");
    const ciphertext = Buffer.from(data.value, "base64");

    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let plaintext = decipher.update(ciphertext, undefined, "utf8");
    plaintext += decipher.final("utf8");

    return plaintext;
};

/** CSPRNG token in base64url (mirror of the legacy randomTokenBase64Url). */
export const randomTokenBase64Url = (bytes: number): string => {
    return randomBytes(bytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
};

/** sha256(value + pepper) hex (mirror of the legacy sha256Hex). */
export const sha256Hex = (value: string, pepper: string): string => {
    return createHash("sha256").update(value + pepper).digest("hex");
};

/** Constant-time string comparison. */
export const safeEqual = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
};
