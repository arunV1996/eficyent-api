import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { env } from "./env";
import { logger } from "../helpers/logger";

/**
 * Secret bundles fetched from AWS Secrets Manager. Each bundle is a JSON
 * document stored under a single secret ID, keyed by SECRET_ID_* env vars.
 *
 * Required secret JSON shapes (proposed convention):
 *
 *   eficyent/<env>/app:
 *     {
 *       "APP_KEY": "<base64 32 bytes>",
 *       "REQUEST_SIGNING_SECRET": "<hex>",
 *       "FVBANK_WEBHOOK_SECRET": "<hex>"
 *     }
 *
 *   eficyent/<env>/db:
 *     {
 *       "host": "...", "port": 3306,
 *       "database": "...", "username": "...", "password": "...",
 *       "ssl": true
 *     }
 *
 *   eficyent/<env>/redis:
 *     {
 *       "host": "...", "port": 6379,
 *       "password": "...", "tls": true,
 *       "username": "default"
 *     }
 *
 *   eficyent/<env>/auth:
 *     {
 *       "TOKEN_PEPPER": "<hex 32 bytes>",
 *       "PASSWORD_PEPPER": "<hex 32 bytes>",
 *       "SIGNATURE_SECRET": "<hex>",
 *       "MERCHANT_SIGNATURE_SECRET": "<hex>"
 *     }
 *
 *   eficyent/<env>/aws:
 *     {
 *       "S3_BUCKET": "...",
 *       "S3_REGION": "us-east-1",
 *       "S3_USE_PATH_STYLE": false
 *     }
 *
 *   eficyent/<env>/mail:
 *     { "host": "...", "port": 587, "username": "...", "password": "...", "from": "no-reply@..." }
 *
 *   eficyent/<env>/external/<provider>:
 *     provider-specific shape, e.g. caliza, diginine, fvbank, sumsub, incode, ...
 *
 * All bundles are cached in memory with TTL = SECRETS_CACHE_TTL_MS.
 * IAM credentials come from the EC2/ECS/EKS instance role - we never read
 * AWS access keys from environment variables.
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

export interface AuthSecret {
  TOKEN_PEPPER: string;
  PASSWORD_PEPPER?: string;
  SIGNATURE_SECRET?: string;
  MERCHANT_SIGNATURE_SECRET?: string;
}

export interface AppSecret {
  APP_KEY: string;
  REQUEST_SIGNING_SECRET?: string;
  FVBANK_WEBHOOK_SECRET?: string;
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

interface CachedEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CachedEntry<unknown>>();
let client: SecretsManagerClient | null = null;

function smClient(): SecretsManagerClient {
  if (!client) {
    client = new SecretsManagerClient({ region: env().AWS_REGION });
  }
  return client;
}

/**
 * Dev mode is signalled by `DATABASE_URL` being set in env. When true,
 * Secrets.* methods read from env vars instead of AWS Secrets Manager
 * so devs can run the API locally without AWS credentials.
 *
 * Production MUST leave DATABASE_URL unset and rely on Secrets Manager.
 */
function useDevSecrets(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function fetchSecret<T>(secretId: string | undefined): Promise<T> {
  if (!secretId) {
    throw new Error(
      "AWS Secrets Manager bundle requested but SECRET_ID_* env var is not set. " +
        "Either set the SECRET_ID for this bundle in production, or set DATABASE_URL " +
        "in dev to enable env-based secrets.",
    );
  }
  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await smClient().send(command);
  const raw = response.SecretString ?? "";
  if (!raw) {
    throw new Error(`Secret ${secretId} has no SecretString`);
  }
  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Secret ${secretId} is not valid JSON`);
  }
  cache.set(secretId, {
    value: parsed,
    expiresAt: Date.now() + env().SECRETS_CACHE_TTL_MS,
  });
  return parsed;
}

// ------- Dev-mode fallbacks (read straight from env) -------------------------

function devApp(): AppSecret {
  return {
    APP_KEY: process.env.APP_KEY ?? "dev-app-key-not-for-production",
    REQUEST_SIGNING_SECRET: process.env.REQUEST_SIGNING_SECRET,
    FVBANK_WEBHOOK_SECRET: process.env.FVBANK_WEBHOOK_SECRET,
  };
}

function devRedis(): RedisSecret {
  const e = env();
  return {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: e.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    db: e.REDIS_DB,
    tls: e.REDIS_TLS,
  };
}

function devAuth(): AuthSecret {
  return {
    TOKEN_PEPPER:
      process.env.TOKEN_PEPPER ??
      "dev-token-pepper-set-TOKEN_PEPPER-in-env-for-stable-tokens",
    PASSWORD_PEPPER: process.env.PASSWORD_PEPPER,
    SIGNATURE_SECRET: process.env.SIGNATURE_SECRET,
    MERCHANT_SIGNATURE_SECRET: process.env.MERCHANT_SIGNATURE_SECRET,
  };
}

function devAws(): AwsSecret {
  const e = env();
  return {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_USE_PATH_STYLE: e.S3_USE_PATH_STYLE,
  };
}

function devMail(): MailSecret {
  const e = env();
  return {
    host: process.env.MAIL_HOST ?? "localhost",
    port: e.MAIL_PORT,
    username: process.env.MAIL_USERNAME,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM ?? "no-reply@example.com",
  };
}

export const Secrets = {
  async app(): Promise<AppSecret> {
    if (useDevSecrets()) return devApp();
    return fetchSecret<AppSecret>(env().SECRET_ID_APP);
  },
  async db(): Promise<DbSecret> {
    // db is only consulted by bootstrapSecrets in production. In dev,
    // DATABASE_URL is read directly by Prisma, so this path is unused.
    return fetchSecret<DbSecret>(env().SECRET_ID_DB);
  },
  async redis(): Promise<RedisSecret> {
    if (useDevSecrets()) return devRedis();
    return fetchSecret<RedisSecret>(env().SECRET_ID_REDIS);
  },
  async auth(): Promise<AuthSecret> {
    if (useDevSecrets()) return devAuth();
    return fetchSecret<AuthSecret>(env().SECRET_ID_AUTH);
  },
  async aws(): Promise<AwsSecret> {
    if (useDevSecrets()) return devAws();
    return fetchSecret<AwsSecret>(env().SECRET_ID_AWS);
  },
  async mail(): Promise<MailSecret> {
    if (useDevSecrets()) return devMail();
    return fetchSecret<MailSecret>(env().SECRET_ID_MAIL);
  },
  /**
   * External provider secrets. In dev, looks for an env var
   * `EXTERNAL_<PROVIDER_UPPER>_JSON` containing the JSON bundle. Most
   * dev workflows don't need these (only required when actually
   * invoking the external provider), so missing env values throw a
   * clear error pointing at the offender.
   */
  async external<T extends Record<string, unknown>>(provider: string): Promise<T> {
    if (useDevSecrets()) {
      const key = `EXTERNAL_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_JSON`;
      const raw = process.env[key];
      if (!raw) {
        throw new Error(
          `External provider "${provider}" is not configured. Set env ${key} ` +
            `to a JSON object with that provider's keys (or unset DATABASE_URL ` +
            `to switch to AWS Secrets Manager mode).`,
        );
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new Error(`Env ${key} is not valid JSON`);
      }
    }
    const prefix = env().SECRET_ID_EXTERNAL_PREFIX;
    if (!prefix) {
      throw new Error(
        "SECRET_ID_EXTERNAL_PREFIX is not set - cannot resolve external provider secrets",
      );
    }
    return fetchSecret<T>(`${prefix}/${provider}`);
  },
  invalidate(secretId?: string): void {
    if (secretId) cache.delete(secretId);
    else cache.clear();
  },
};

/**
 * Build a Prisma-compatible mysql:// URL from the DB secret. Username and
 * password are URL-encoded so that special characters do not break the DSN.
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

/**
 * Bootstrap secrets at process start. Called once from index.ts and worker.ts.
 * Fails fast if any required bundle cannot be resolved.
 *
 * Dev mode (DATABASE_URL set in env) skips AWS entirely - Prisma reads
 * DATABASE_URL directly, and the rest of the bundles fall back to env vars
 * via the per-bundle dev fallbacks defined above.
 */
export async function bootstrapSecrets(): Promise<void> {
  if (env().DATABASE_URL) {
    logger.info(
      { event: "secrets.skip" },
      "DATABASE_URL set in env - skipping Secrets Manager bootstrap (dev mode)",
    );
    return;
  }

  logger.info({ event: "secrets.fetch" }, "Loading secrets from AWS Secrets Manager");

  // Load all required bundles concurrently. Any failure aborts boot.
  const [db] = await Promise.all([
    Secrets.db(),
    Secrets.app(),
    Secrets.auth(),
    Secrets.redis(),
  ]);

  // Inject DB URL for Prisma. Prisma reads this from process.env at client init.
  process.env.DATABASE_URL = buildDatabaseUrl(db);

  logger.info({ event: "secrets.loaded" }, "Secrets bootstrap complete");
}
