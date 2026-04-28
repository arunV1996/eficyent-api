import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * SHA-256 hex digest, with optional pepper. We use this for opaque token
 * fingerprints (the value stored in personal_access_tokens.token).
 *
 * Why peppered SHA-256 instead of bcrypt/argon2 for tokens:
 *   - Tokens are 40 bytes of CSPRNG output - already brute-force-resistant.
 *   - Lookup must be O(1); bcrypt/argon2 cannot be indexed.
 *   - The pepper (loaded from Secrets Manager) ensures DB exfiltration alone
 *     doesn't yield usable tokens.
 */
export function sha256Hex(input: string, pepper?: string): string {
  if (pepper) {
    return createHmac("sha256", pepper).update(input).digest("hex");
  }
  return createHash("sha256").update(input).digest("hex");
}

export function randomTokenBase64Url(byteLength: number): string {
  return randomBytes(byteLength)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still do a constant-time compare on a fixed-size buffer to avoid leaks.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Hash a request body for idempotency binding. We don't hash the raw bytes
 * to avoid binding to whitespace; we hash a stable JSON representation.
 */
export function stableJsonHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
