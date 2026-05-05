import {
  DecryptCommand,
  EncryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from "@aws-sdk/client-kms";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { env } from "./env";

/**
 * Local crypto mode: when KMS_KEY_ID is unset we substitute a local
 * AES-256-GCM key derived from APP_KEY for envelope encryption. This
 * is decoupled from DATABASE_URL/local mode so production hosts that
 * have KMS configured still go through real KMS, while local boxes
 * that don't have AWS at all keep working.
 *
 * Ciphertext is tagged with the `v1d` prefix; KMS-encrypted ciphertext
 * uses `v1`. The `decryptEnvelope` path detects which based on the
 * prefix so both can coexist in the same DB during a migration.
 *
 * SECURITY: leaving KMS_KEY_ID unset is intended for local dev only.
 * Production deployments MUST set KMS_KEY_ID to a real KMS key.
 */
function useLocalCrypto(): boolean {
  return !env().KMS_KEY_ID;
}

function devKey(): Buffer {
  const seed = process.env.APP_KEY ?? "dev-app-key-not-for-production";
  return createHash("sha256").update(seed).digest();
}

const DEV_PREFIX = "v1d";

/**
 * KMS-backed envelope encryption.
 *
 * Two modes:
 *   - encryptDirect / decryptDirect: KMS-only. Use for very small values
 *     (<= 4 KB) where the round-trip cost is acceptable. Each call is a
 *     KMS API call; not appropriate for hot paths.
 *
 *   - encryptEnvelope / decryptEnvelope: KMS generates a per-record
 *     data key, AES-256-GCM is used locally. Ciphertext payload is:
 *
 *       v1:<base64 encrypted_data_key>:<base64 iv>:<base64 ciphertext+tag>
 *
 *     The data key is encrypted under the KMS CMK and stored alongside the
 *     ciphertext - so decryption requires the KMS CMK plus the row.
 *
 * Use this for any column the SOC audit considers sensitive: tfa_secret,
 * private_key/public_key, beneficiary PII, external service tokens, etc.
 */

let client: KMSClient | null = null;
function kmsClient(): KMSClient {
  if (!client) {
    client = new KMSClient({ region: env().AWS_REGION });
  }
  return client;
}

const ENVELOPE_PREFIX = "v1";
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

function b64(buf: Buffer): string {
  return buf.toString("base64");
}
function b64decode(s: string): Buffer {
  return Buffer.from(s, "base64");
}

export async function encryptEnvelope(plaintext: string): Promise<string> {
  if (useLocalCrypto()) {
    const key = devKey();
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [DEV_PREFIX, b64(iv), b64(Buffer.concat([ct, tag]))].join(":");
  }
  const cmd = new GenerateDataKeyCommand({
    KeyId: env().KMS_KEY_ID,
    KeySpec: "AES_256",
  });
  const dk = await kmsClient().send(cmd);
  if (!dk.Plaintext || !dk.CiphertextBlob) {
    throw new Error("KMS GenerateDataKey returned empty material");
  }
  const dataKey = Buffer.from(dk.Plaintext);
  const encryptedDataKey = Buffer.from(dk.CiphertextBlob);
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Wipe data key
  dataKey.fill(0);
  return [
    ENVELOPE_PREFIX,
    b64(encryptedDataKey),
    b64(iv),
    b64(Buffer.concat([ct, tag])),
  ].join(":");
}

export async function decryptEnvelope(payload: string): Promise<string> {
  const parts = payload.split(":");
  if (parts[0] === DEV_PREFIX) {
    if (parts.length !== 3) throw new Error("Invalid dev envelope format");
    const [, ivB64, ctTagB64] = parts as [string, string, string];
    const key = devKey();
    const iv = b64decode(ivB64);
    const ctTag = b64decode(ctTagB64);
    const ct = ctTag.subarray(0, ctTag.length - GCM_TAG_BYTES);
    const tag = ctTag.subarray(ctTag.length - GCM_TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  }
  if (parts.length !== 4 || parts[0] !== ENVELOPE_PREFIX) {
    throw new Error("Invalid envelope format");
  }
  const [, encryptedDataKey, ivB64, ctTagB64] = parts as [string, string, string, string];
  const decryptCmd = new DecryptCommand({
    CiphertextBlob: b64decode(encryptedDataKey),
    KeyId: env().KMS_KEY_ID,
  });
  const dec = await kmsClient().send(decryptCmd);
  if (!dec.Plaintext) {
    throw new Error("KMS Decrypt returned empty plaintext");
  }
  const dataKey = Buffer.from(dec.Plaintext);
  const iv = b64decode(ivB64);
  const ctTag = b64decode(ctTagB64);
  if (ctTag.length < GCM_TAG_BYTES) {
    throw new Error("Ciphertext too short");
  }
  const ct = ctTag.subarray(0, ctTag.length - GCM_TAG_BYTES);
  const tag = ctTag.subarray(ctTag.length - GCM_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  dataKey.fill(0);
  return pt.toString("utf8");
}

/**
 * KMS-direct encryption. Use only for small (<= 4KB) one-off values where the
 * extra KMS hop is acceptable. Output is base64 of the KMS CiphertextBlob.
 */
export async function encryptDirect(plaintext: string): Promise<string> {
  if (useLocalCrypto()) return encryptEnvelope(plaintext);
  const cmd = new EncryptCommand({
    KeyId: env().KMS_KEY_ID,
    Plaintext: Buffer.from(plaintext, "utf8"),
  });
  const out = await kmsClient().send(cmd);
  if (!out.CiphertextBlob) throw new Error("KMS Encrypt returned empty blob");
  return Buffer.from(out.CiphertextBlob).toString("base64");
}

export async function decryptDirect(ciphertext: string): Promise<string> {
  if (useLocalCrypto() || ciphertext.startsWith(`${DEV_PREFIX}:`) || ciphertext.startsWith(`${ENVELOPE_PREFIX}:`)) {
    return decryptEnvelope(ciphertext);
  }
  const cmd = new DecryptCommand({
    CiphertextBlob: b64decode(ciphertext),
    KeyId: env().KMS_KEY_ID,
  });
  const out = await kmsClient().send(cmd);
  if (!out.Plaintext) throw new Error("KMS Decrypt returned empty plaintext");
  return Buffer.from(out.Plaintext).toString("utf8");
}
