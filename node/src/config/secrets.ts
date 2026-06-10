import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { env } from "./env";
import { logger } from "../helpers/logger";

/**
 * AWS Secrets Manager + env, unified flat key/value model.
 *
 * Resolution rule for every key: SECRET > ENV > default.
 *
 *   1. If `SECRET_ID_BUNDLE` is set, the named AWS secret is fetched
 *      once at boot and cached for SECRETS_CACHE_TTL_MS. The secret's
 *      `SecretString` MUST be a flat JSON object (the format AWS
 *      Secrets Manager uses when you click "Plaintext" - this is
 *      identical to the "Key/value" UI mode).
 *   2. For each Secrets.* lookup we try the flat secret first, then
 *      `process.env`, then fall back to the documented default.
 *   3. Adding a new key in AWS Secrets Manager works automatically -
 *      the next consumer that reads that key picks it up without
 *      a code change. External-provider lookups scan the flat secret
 *      for any `EXTERNAL_<PROVIDER>_*` key and return them as an
 *      object stripped of the prefix.
 *
 * Recognised flat keys (any combination is fine - missing keys fall
 * through to env, then to defaults):
 *
 *   APP layer:
 *     APP_KEY                      base64 32-byte app key
 *     REQUEST_SIGNING_SECRET       hex 32 bytes
 *     FVBANK_WEBHOOK_SECRET        hex 32 bytes (used by the FvBank webhook
 *                                  signature middleware)
 *
 *   Database (either DATABASE_URL OR the DB_* parts):
 *     DATABASE_URL                 mysql://user:pass@host:port/db (overrides DB_*)
 *     DB_HOST                      127.0.0.1
 *     DB_PORT                      3306
 *     DB_DATABASE                  database name
 *     DB_USERNAME                  username
 *     DB_PASSWORD                  password (DO NOT URL-encode here)
 *     DB_SSL                       true|false
 *
 *   Redis:
 *     REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_USERNAME,
 *     REDIS_TLS, REDIS_DB
 *
 *   Auth peppers + signature secrets:
 *     TOKEN_PEPPER, PASSWORD_PEPPER, SIGNATURE_SECRET, MERCHANT_SIGNATURE_SECRET
 *
 *   AWS:
 *     S3_BUCKET, S3_REGION, S3_USE_PATH_STYLE
 *
 *   Mail:
 *     MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM
 *
 *   External providers (any key with this prefix is exposed via
 *   Secrets.external("<provider>")):
 *     EXTERNAL_<PROVIDER>_<KEY>
 *     e.g. EXTERNAL_MASSIVE_URL, EXTERNAL_MASSIVE_API_KEY,
 *          EXTERNAL_COMPLIANCE_URL, EXTERNAL_PROCESSINGUNIT_API_SECRET
 *
 * KMS is independent of this layer - controlled by KMS_KEY_ID being
 * set or unset (see config/kms.ts). IAM credentials come from the
 * EC2/ECS/EKS instance role; we never read AWS access keys from env.
 */

export interface DbSecret {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface RedisSecret {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: boolean;
  db?: number;
}

export interface AppSecret {
  APP_KEY: string;
  REQUEST_SIGNING_SECRET?: string;
  FVBANK_WEBHOOK_SECRET?: string;
  CORS_ORIGINS?: string;
}

export interface AuthSecret {
  TOKEN_PEPPER: string;
  PASSWORD_PEPPER?: string;
  SIGNATURE_SECRET?: string;
  MERCHANT_SIGNATURE_SECRET?: string;
}

export interface AwsSecret {
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_USE_PATH_STYLE?: boolean;
}

export interface MailSecret {
  host: string;
  port: number;
  username?: string;
  password?: string;
  from: string;
}

interface CachedFlat {
  value: Record<string, string>;
  expiresAt: number;
}

let cache: CachedFlat | null = null;
let client: SecretsManagerClient | null = null;

function smClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({ region: env().AWS_REGION });
  }
  return client;
}

/**
 * Fetch the bundled AWS secret as a flat string-keyed map.
 * Returns an empty object if SECRET_ID_BUNDLE is not configured.
 */
async function loadFlatSecret(): Promise<Record<string, string>> {
  const id = env().SECRET_ID_BUNDLE;
  if (!id) return {};
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const cmd = new GetSecretValueCommand({ SecretId: id });
  const res = await smClient().send(cmd);
  const raw = res.SecretString ?? "";
  if (!raw) {
    throw new Error(`Secret ${id} has no SecretString`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Secret ${id} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Secret ${id} must be a flat JSON object (key/value pairs)`);
  }

  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") {
      logger.warn(
        { key: k, secretId: id },
        "secret bundle contains a nested object - flatten it (e.g. EXTERNAL_<PROVIDER>_<KEY>) so it is picked up",
      );
      continue;
    }
    flat[k] = String(v);
  }
  cache = { value: flat, expiresAt: Date.now() + env().SECRETS_CACHE_TTL_MS };
  return flat;
}

/** secret > env > fallback. Always returns the resolved value or the fallback. */
async function cfg(key: string, fallback?: string): Promise<string | undefined> {
  const flat = await loadFlatSecret();
  return flat[key] ?? process.env[key] ?? fallback;
}

const TRUE_SET = new Set(["1", "true", "yes", "on"]);

function asBool(v: string | undefined): boolean {
  if (v === undefined) return false;
  return TRUE_SET.has(v.toLowerCase());
}

function asNumber(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const Secrets = {
  async app(): Promise<AppSecret> {
    return {
      APP_KEY: (await cfg("APP_KEY")) ?? "dev-app-key-not-for-production",
      REQUEST_SIGNING_SECRET: await cfg("REQUEST_SIGNING_SECRET"),
      FVBANK_WEBHOOK_SECRET: await cfg("FVBANK_WEBHOOK_SECRET"),
      CORS_ORIGINS: await cfg("CORS_ORIGINS"),
    };
  },

  async db(): Promise<DbSecret> {
    // Prefer a fully-formed DATABASE_URL when present; otherwise compose
    // from the DB_* keys. Both forms read secret > env per cfg().
    const url = await cfg("DATABASE_URL");
    if (url) {
      const parsed = parseMysqlUrl(url);
      if (parsed) return parsed;
    }
    return {
      host: (await cfg("DB_HOST")) ?? "127.0.0.1",
      port: asNumber(await cfg("DB_PORT"), 3306),
      database:
        (await cfg("DB_DATABASE")) ??
        (await cfg("DB_NAME")) ??
        "eficyent",
      username:
        (await cfg("DB_USERNAME")) ??
        (await cfg("DB_USER")) ??
        "root",
      password: (await cfg("DB_PASSWORD")) ?? "",
      ssl: asBool(await cfg("DB_SSL")),
    };
  },

  async redis(): Promise<RedisSecret> {
    return {
      host: (await cfg("REDIS_HOST")) ?? "127.0.0.1",
      port: asNumber(await cfg("REDIS_PORT"), 6379),
      password: (await cfg("REDIS_PASSWORD")) || undefined,
      username: (await cfg("REDIS_USERNAME")) || undefined,
      tls: asBool(await cfg("REDIS_TLS")),
      db: asNumber(await cfg("REDIS_DB"), 0),
    };
  },

  async auth(): Promise<AuthSecret> {
    return {
      TOKEN_PEPPER:
        (await cfg("TOKEN_PEPPER")) ??
        "dev-token-pepper-set-TOKEN_PEPPER-in-env-or-secret",
      PASSWORD_PEPPER: await cfg("PASSWORD_PEPPER"),
      SIGNATURE_SECRET: await cfg("SIGNATURE_SECRET"),
      MERCHANT_SIGNATURE_SECRET: await cfg("MERCHANT_SIGNATURE_SECRET"),
    };
  },

  async aws(): Promise<AwsSecret> {
    return {
      S3_BUCKET: await cfg("S3_BUCKET"),
      S3_REGION: await cfg("S3_REGION"),
      S3_USE_PATH_STYLE: asBool(await cfg("S3_USE_PATH_STYLE")),
    };
  },

  async mail(): Promise<MailSecret> {
    return {
      host: (await cfg("MAIL_HOST")) ?? "localhost",
      port: asNumber(await cfg("MAIL_PORT"), 587),
      username: (await cfg("MAIL_USERNAME")) || undefined,
      password: (await cfg("MAIL_PASSWORD")) || undefined,
      from: (await cfg("MAIL_FROM")) ?? "no-reply@example.com",
    };
  },

  /**
   * Returns ALL keys with prefix `EXTERNAL_<PROVIDER>_` (uppercase),
   * stripped of that prefix. Resolution is secret > env. Adding new
   * keys works without code changes - the consumer just reads the new
   * key off the returned object.
   *
   * Example: provider "massive" returns the value of every key whose
   * name starts with `EXTERNAL_MASSIVE_`, so:
   *   EXTERNAL_MASSIVE_URL                  -> obj.URL
   *   EXTERNAL_MASSIVE_API_KEY              -> obj.API_KEY
   *   EXTERNAL_MASSIVE_GET_QUOTE_ENDPOINT   -> obj.GET_QUOTE_ENDPOINT
   */
  async external<T extends Record<string, unknown>>(provider: string): Promise<T> {
    const prefix = `EXTERNAL_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
    const out: Record<string, string> = {};

    const flat = await loadFlatSecret();
    for (const [k, v] of Object.entries(flat)) {
      if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    }
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined || !k.startsWith(prefix)) continue;
      const stripped = k.slice(prefix.length);
      // Secret values win over env per the documented precedence.
      if (out[stripped] === undefined) out[stripped] = v;
    }
    if (Object.keys(out).length === 0) {
      throw new Error(
        `External provider "${provider}" has no keys configured. ` +
        `Set ${prefix}* keys in your bundled AWS secret OR in env.`,
      );
    }
    return out as T;
  },

  /** Wipe the cache so the next read re-fetches from AWS. */
  invalidate(): void {
    cache = null;
  },
};

/**
 * Build a Prisma-compatible mysql:// URL from the DB secret. Username
 * and password are URL-encoded so special characters do not break the
 * DSN. Use this when you ONLY have the parts (DB_HOST etc.) and need
 * a connection string.
 */
export function buildDatabaseUrl(secret: DbSecret): string {
  const user = encodeURIComponent(secret.username);
  const pass = encodeURIComponent(secret.password);
  const host = secret.host;
  const port = secret.port;
  const db = encodeURIComponent(secret.database);
  const ssl = secret.ssl ? "?sslaccept=strict" : "";
  return `mysql://${user}:${pass}@${host}:${port}/${db}${ssl}`;
}

function parseMysqlUrl(url: string): DbSecret | null {
  const m = /^mysql:\/\/([^:@\/]+):([^@\/]*)@([^:\/]+):(\d+)\/([^?]+)(\?.*)?$/.exec(url);
  if (!m) return null;
  return {
    username: decodeURIComponent(m[1]!),
    password: decodeURIComponent(m[2]!),
    host: m[3]!,
    port: Number(m[4]!),
    database: decodeURIComponent(m[5]!),
    ssl: (m[6] ?? "").includes("sslaccept"),
  };
}

/**
 * Bootstrap secrets at process start. Called once from index.ts and
 * worker.ts. Resolves Prisma's DATABASE_URL (which Prisma reads from
 * process.env at client init) and warms the secret cache.
 *
 * Resolution: when SECRET_ID_BUNDLE is set, fetch the secret. Then
 * compute DATABASE_URL via secret > env > built-from-DB_*. The result
 * is written back to process.env so Prisma sees it.
 */
export async function bootstrapSecrets(): Promise<void> {
  const id = env().SECRET_ID_BUNDLE;
  if (id) {
    logger.info(
      { event: "secrets.fetch" },
      "Loading bundled secret",
    );
    const flat = await loadFlatSecret();
    // Hydrate bundled keys into process.env so code that reads process.env.*
    // directly (e.g. kms.ts's getAppKey reading APP_KEY) picks up the
    // bundled value. Mirrors cfg()'s secret > env precedence.
    for (const [k, v] of Object.entries(flat)) {
      process.env[k] = v;
    }
    logger.info(
      { event: "secrets.loaded", keys: Object.keys(flat).length },
      "Secrets bootstrap complete",
    );
  } else {
    logger.info(
      { event: "secrets.skip" },
      "SECRET_ID_BUNDLE not set - reading values from env only",
    );
  }

  // Inject Prisma's DATABASE_URL. Precedence:
  //   1. cfg("DATABASE_URL") - secret first, then env.DATABASE_URL
  //   2. compose from cfg("DB_HOST"), cfg("DB_PORT"), ...
  const directUrl = await cfg("DATABASE_URL");
  if (directUrl) {
    process.env.DATABASE_URL = directUrl;
  } else {
    process.env.DATABASE_URL = buildDatabaseUrl(await Secrets.db());
  }
}
