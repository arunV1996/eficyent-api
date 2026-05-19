import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

/**
 * Standard Laravel AES-256-CBC Encryption.
 * Completely replaces the previous AWS KMS envelope scheme.
 * 
 * Works symmetrically with Laravel's Illuminate\\Encryption\\Encrypter.
 */

const DEV_PREFIX = "v1d";
const ENVELOPE_PREFIX = "v1";

function getAppKey(): Buffer {
  let appKey = process.env.APP_KEY ?? "";
  if (appKey.startsWith("base64:")) appKey = appKey.slice(7);
  if (!appKey) {
    throw new Error("APP_KEY is not set - required for Laravel encryption/decryption.");
  }
  const key = Buffer.from(appKey, "base64");
  if (key.length !== 32) {
    throw new Error("APP_KEY must be exactly 32 bytes for AES-256-CBC.");
  }
  return key;
}

export async function encryptEnvelope(plaintext: string): Promise<string> {
  const key = getAppKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  
  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");
  
  const ivBase64 = iv.toString("base64");

  // Laravel HMAC validation includes iv + value
  const mac = createHmac("sha256", key)
    .update(ivBase64 + ciphertext)
    .digest("hex");

  const payload = {
    iv: ivBase64,
    value: ciphertext,
    mac: mac,
    tag: "" // Empty tag is expected by Laravel CBC mode
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export async function decryptEnvelope(payload: string): Promise<string> {
  const parts = payload.split(":");
  if (parts.length > 2 && (parts[0] === DEV_PREFIX || parts[0] === ENVELOPE_PREFIX)) {
      throw new Error(`Legacy Node backend ${parts[0]} key detected. Please clear this user's private_key/salt_key in your DB so it can be regenerated in Laravel format.`);
  }

  const key = getAppKey();
  const json = Buffer.from(payload, "base64").toString("utf8");
  
  let data;
  try {
    data = JSON.parse(json) as { iv?: string; value?: string; mac?: string };
  } catch (e) {
    throw new Error("Payload is not valid JSON. Ensure it is a valid Laravel encrypter payload.");
  }

  if (!data.iv || !data.value || !data.mac) {
    throw new Error("Malformed Laravel encryption payload.");
  }

  // Prevent timing attacks by using timingSafeEqual for MAC validation
  const expectedMacStr = createHmac("sha256", key)
    .update(data.iv + data.value)
    .digest("hex");
    
  const expectedMac = Buffer.from(expectedMacStr);
  const providedMac = Buffer.from(data.mac);

  if (expectedMac.length !== providedMac.length || !timingSafeEqual(expectedMac, providedMac)) {
    throw new Error("MAC validation failed - Data was tampered with or APP_KEY is incorrect");
  }

  const iv = Buffer.from(data.iv, "base64");
  const ciphertext = Buffer.from(data.value, "base64");

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  let pt = decipher.update(ciphertext, undefined, "utf8");
  pt += decipher.final("utf8");

  return pt;
}

// Aliased directly to encryptEnvelope to avoid code changes in controllers
export async function encryptDirect(plaintext: string): Promise<string> {
  return encryptEnvelope(plaintext);
}

// Aliased directly to decryptEnvelope to avoid code changes in controllers
export async function decryptDirect(ciphertext: string): Promise<string> {
  return decryptEnvelope(ciphertext);
}
