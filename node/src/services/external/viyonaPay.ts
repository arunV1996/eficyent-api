import {
  createCipheriv,
  createDecipheriv,
  createSign,
  publicEncrypt,
  randomBytes,
  randomUUID,
  constants as cryptoConstants,
  createPublicKey,
  createPrivateKey,
} from "crypto";
import { call } from "./httpClient";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Services\\ViyonaPay\\* - the heaviest provider.
 *
 * Crypto envelope (mirror of Laravel implementation):
 *
 *   1. Generate a 32-byte session key.
 *   2. AAD = canonical JSON of { client_id, request_id, timestamp }.
 *   3. encrypted_data    = base64( AES-256-GCM(session_key, plain_payload, AAD) )
 *      - Layout in the base64 envelope: [12B IV][ciphertext][16B tag]
 *      - Plaintext is JSON of the request body.
 *   4. encrypted_session_key = base64( RSA-OAEP-SHA256(server_pub_key, session_key) )
 *   5. signature        = base64( RSA-SHA256(client_priv_key, canonical_json(body)) )
 *      - body is the outer envelope (everything except the signature).
 *
 * Headers: X-API-KEY, X-API-TYPE, X-REQUEST-ID, X-SIGNATURE, optional Bearer.
 *
 * Response is symmetrically encrypted; we decrypt with the same session
 * key and AAD.
 *
 * Secret bundle:
 *   {
 *     "URL": "...",
 *     "BASE_URL": "...",
 *     "CLIENT_ID": "...",
 *     "CLIENT_SECRET": "...",
 *     "CLIENT_API_KEY": "...",
 *     "CLIENT_API_TYPE": "...",
 *     "CLIENT_PRIVATE_KEY_PEM": "-----BEGIN PRIVATE KEY-----\n...",
 *     "SERVER_PUBLIC_KEY_PEM":  "-----BEGIN PUBLIC KEY-----\n...",
 *     "AUTH_TOKEN_ENDPOINT":    "/v1/auth/token",
 *     "AUTH_TOKEN_ENDPOINT_V2": "/v2/auth/token",
 *     "GET_TRANSACTION_STATUS_ENDPOINT": "/v1/...",
 *     "GET_TRANSACTION_STATUS_ENDPOINT_V2": "/v2/..."
 *   }
 */

interface ViyonaPaySecret extends Record<string, unknown> {
  URL: string;
  BASE_URL: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  CLIENT_API_KEY: string;
  CLIENT_API_TYPE: string;
  CLIENT_PRIVATE_KEY_PEM: string;
  SERVER_PUBLIC_KEY_PEM: string;
  AUTH_TOKEN_ENDPOINT: string;
  AUTH_TOKEN_ENDPOINT_V2: string;
  GET_TRANSACTION_STATUS_ENDPOINT: string;
  GET_TRANSACTION_STATUS_ENDPOINT_V2: string;
}

let cachedSecret: ViyonaPaySecret | null = null;
async function loadSecret(): Promise<ViyonaPaySecret> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await Secrets.external<ViyonaPaySecret>("viyona_pay");
  return cachedSecret;
}

/**
 * canonical_json: keys sorted lexicographically, no escaped slashes, no
 * extraneous whitespace. Mirror of Laravel JSON_UNESCAPED_UNICODE +
 * JSON_UNESCAPED_SLASHES with ksort applied recursively.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object" || value instanceof Date) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

function rsaOaepEncrypt(
  serverPublicKeyPem: string,
  data: Buffer,
): string {
  const key = createPublicKey({
    key: serverPublicKeyPem,
    format: "pem",
  });
  const ct = publicEncrypt(
    {
      key,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    data,
  );
  return ct.toString("base64");
}

function rsaSign(privateKeyPem: string, payload: string): string {
  const key = createPrivateKey({ key: privateKeyPem, format: "pem" });
  const signer = createSign("RSA-SHA256");
  signer.update(payload);
  signer.end();
  return signer.sign(key).toString("base64");
}

function aesGcmEncrypt(
  payload: unknown,
  sessionKey: Buffer,
  aad: string,
): string {
  if (sessionKey.length !== 32) {
    throw new Error("AES-256 requires a 32-byte session key");
  }
  const iv = randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const cipher = createCipheriv("aes-256-gcm", sessionKey, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

function aesGcmDecrypt(
  encryptedBase64: string,
  sessionKey: Buffer,
  aad: string,
): unknown {
  const buf = Buffer.from(encryptedBase64, "base64");
  if (buf.length < 12 + 16) throw new Error("Invalid encrypted payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", sessionKey, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
}

interface RequestExtras {
  url?: string;
  reference?: string;
  access_token?: string;
}

async function viyonaRequest(
  endpoint: string,
  plainPayload: Record<string, unknown>,
  accessToken: string | null,
  extras: RequestExtras,
): Promise<Record<string, unknown>> {
  const secret = await loadSecret();
  const requestId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const sessionKey = randomBytes(32);

  const aadObj = {
    client_id: secret.CLIENT_ID,
    request_id: requestId,
    timestamp,
  };
  const aad = canonicalJson(aadObj);

  const encryptedData = aesGcmEncrypt(plainPayload, sessionKey, aad);
  const encryptedSessionKey = rsaOaepEncrypt(secret.SERVER_PUBLIC_KEY_PEM, sessionKey);

  const body = {
    client_id: secret.CLIENT_ID,
    request_id: requestId,
    timestamp,
    encrypted_data: encryptedData,
    encrypted_session_key: encryptedSessionKey,
  };
  const signature = rsaSign(secret.CLIENT_PRIVATE_KEY_PEM, canonicalJson(body));

  const headers: Record<string, string> = {
    "X-API-KEY": secret.CLIENT_API_KEY,
    "X-API-TYPE": secret.CLIENT_API_TYPE,
    "X-REQUEST-ID": requestId,
    "X-SIGNATURE": signature,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const baseUrl = extras.url ? new URL(extras.url).origin : secret.URL;
  const path = extras.url ? new URL(extras.url).pathname : endpoint;

  const res = await call<{ encrypted_data?: string; result?: string }>(
    {
      provider: "viyonapay",
      callFor: extras.reference ?? "create",
    },
    {
      method: "POST",
      baseUrl,
      path,
      body: { ...extras, request_body: body },
      headers,
      timeoutMs: 120_000,
    },
  );

  const enc = res.body?.encrypted_data;
  if (!enc) throw new Error("ViyonaPay: encrypted response missing");
  const decrypted = aesGcmDecrypt(enc, sessionKey, aad) as Record<string, unknown>;
  if ((decrypted.response_status ?? 0) !== 1) {
    throw new Error(
      typeof decrypted.result === "string" ? decrypted.result : "ViyonaPay error",
    );
  }
  return decrypted;
}

async function getAccessToken(): Promise<string> {
  const secret = await loadSecret();
  const decrypted = await viyonaRequest(
    secret.AUTH_TOKEN_ENDPOINT_V2,
    {
      client_secret: secret.CLIENT_SECRET,
      scopes: [secret.CLIENT_API_TYPE],
    },
    null,
    {
      url: secret.BASE_URL + secret.AUTH_TOKEN_ENDPOINT,
      reference: "Get Access Token",
    },
  );
  const data = decrypted.data as { access_token?: string } | undefined;
  if (!data?.access_token) throw new Error("ViyonaPay access_token missing");
  return data.access_token;
}

export const ViyonaPay = {
  /**
   * Mirror of ViyonaPay BeneficiaryTransactionService::check_status.
   * Returns { success, data, message } - matches the user-side
   * expectations from the BeneficiaryTransaction status_check flow.
   */
  async checkTransactionStatus(payload: Record<string, unknown>): Promise<{
    success: boolean;
    message: string;
    data: Record<string, unknown> | null;
  }> {
    try {
      const secret = await loadSecret();
      const accessToken = await getAccessToken();
      const decrypted = await viyonaRequest(
        secret.GET_TRANSACTION_STATUS_ENDPOINT_V2,
        payload,
        accessToken,
        {
          url: secret.BASE_URL + secret.GET_TRANSACTION_STATUS_ENDPOINT,
          reference: "Check Transaction Status",
          access_token: accessToken,
        },
      );
      if (decrypted.result !== "success") {
        return {
          success: false,
          message:
            typeof decrypted.result === "string"
              ? decrypted.result
              : "Status check failed",
          data: null,
        };
      }
      return {
        success: true,
        message: "ok",
        data:
          (decrypted.response_body as Record<string, unknown> | undefined) ?? null,
      };
    } catch (err) {
      logger.error({ err }, "ViyonaPay.checkTransactionStatus threw");
      return { success: false, message: String(err), data: null };
    }
  },
};
