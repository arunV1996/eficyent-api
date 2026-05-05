import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { env } from "./env";
import { logger } from "../helpers/logger";

/**
 * One bundled secret stored in AWS Secrets Manager. Set
 * `SECRET_ID_BUNDLE` (env var) to the secret's ARN or name. The secret's
 * `SecretString` MUST be a JSON document with this exact shape:
 *
 *   {
 *     "app":   { "APP_KEY": "...", "REQUEST_SIGNING_SECRET": "...", "FVBANK_WEBHOOK_SECRET": "..." },
 *     "db":    { "host": "...", "port": 3306, "database": "...", "username": "...", "password": "...", "ssl": true },
 *     "redis": { "host": "...", "port": 6379, "password": "...", "tls": true, "username": "default" },
 *     "auth":  { "TOKEN_PEPPER": "...", "PASSWORD_PEPPER": "...", "SIGNATURE_SECRET": "...", "MERCHANT_SIGNATURE_SECRET": "..." },
 *     "aws":   { "S3_BUCKET": "...", "S3_REGION": "us-east-1", "S3_USE_PATH_STYLE": false },
 *     "mail":  { "host": "...", "port": 587, "username": "...", "password": "...", "from": "no-reply@..." },
 *     "external": {
 *        "caliza":   { "URL": "...", "API_KEY": "...", "CALLBACK_URL": "..." },
 *        "diginine": { ... },
 *        "fvbank":   { "CLIENT_SECRET": "..." },
 *        "report_server": { "BASE_URL": "...", "HEADER_KEY": "x-api-key", "HEADER_VALUE": "...", "VIYONAPAY": "...", "DIGININE": "..." },
 *        "<other-provider>": { ... }
 *     }
 *   }
 *
 * The bundle is cached in memory with TTL = SECRETS_CACHE_TTL_MS.
 * IAM credentials come from the EC2/ECS/EKS instance role - we never
 * read AWS access keys from environment variables.
 *
 * For local development set `DATABASE_URL` instead of
 * `SECRET_ID_BUNDLE`; AWS will be skipped entirely and every value
 * is read from env vars (see env.ts).
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
 * Local mode: when DATABASE_URL is set, every Secrets.* call reads from
 * env vars instead of AWS Secrets Manager so the API can run without
 * AWS credentials. Production MUST leave DATABASE_URL unset and set
 * SECRET_ID_BUNDLE instead.
 */
function useLocalSecrets(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

interface BundledSecret {
  app?: AppSecret;
  db?: DbSecret;
  redis?: RedisSecret;
  auth?: AuthSecret;
  aws?: AwsSecret;
  mail?: MailSecret;
  external?: Record<string, Record<string, unknown>>;
}

async function loadBundle(): Promise<BundledSecret> {
  const secretId = env().SECRET_ID_BUNDLE;
  if (!secretId) {
    throw new Error(
      "Neither DATABASE_URL nor SECRET_ID_BUNDLE is set. Set DATABASE_URL " +
        "for local development, or SECRET_ID_BUNDLE to your AWS Secrets " +
        "Manager secret ARN/name for staging/production.",
    );
  }
  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as BundledSecret;
  }
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await smClient().send(command);
  const raw = response.SecretString ?? "";
  if (!raw) {
    throw new Error(`Secret ${secretId} has no SecretString`);
  }
  let parsed: BundledSecret;
  try {
    parsed = JSON.parse(raw) as BundledSecret;
  } catch {
    throw new Error(`Secret ${secretId} is not valid JSON`);
  }
  cache.set(secretId, {
    value: parsed,
    expiresAt: Date.now() + env().SECRETS_CACHE_TTL_MS,
  });
  return parsed;
}

function requireBundleSlice<K extends keyof BundledSecret>(
  bundle: BundledSecret,
  key: K,
): NonNullable<BundledSecret[K]> {
  const v = bundle[key];
  if (!v) {
    throw new Error(
      `SECRET_ID_BUNDLE is missing required "${key}" key. See node/README.md ` +
        `for the expected JSON shape.`,
    );
  }
  return v as NonNullable<BundledSecret[K]>;
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
    if (useLocalSecrets()) return devApp();
    return requireBundleSlice(await loadBundle(), "app");
  },
  async db(): Promise<DbSecret> {
    if (useLocalSecrets()) {
      // Prisma reads DATABASE_URL directly; this path is only consulted
      // by bootstrapSecrets() in production.
      throw new Error("Secrets.db() called in local mode - Prisma reads DATABASE_URL directly");
    }
    return requireBundleSlice(await loadBundle(), "db");
  },
  async redis(): Promise<RedisSecret> {
    if (useLocalSecrets()) return devRedis();
    return requireBundleSlice(await loadBundle(), "redis");
  },
  async auth(): Promise<AuthSecret> {
    if (useLocalSecrets()) return devAuth();
    return requireBundleSlice(await loadBundle(), "auth");
  },
  async aws(): Promise<AwsSecret> {
    if (useLocalSecrets()) return devAws();
    return requireBundleSlice(await loadBundle(), "aws");
  },
  async mail(): Promise<MailSecret> {
    if (useLocalSecrets()) return devMail();
    return requireBundleSlice(await loadBundle(), "mail");
  },
  /**
   * External provider secrets. Local mode reads `EXTERNAL_<PROVIDER>_JSON`
   * env vars; production reads `bundle.external[<provider>]` from the
   * SECRET_ID_BUNDLE secret.
   */
  async external<T extends Record<string, unknown>>(provider: string): Promise<T> {
    if (useLocalSecrets()) {
      const key = `EXTERNAL_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_JSON`;
      const raw = process.env[key];
      if (!raw) {
        throw new Error(
          `External provider "${provider}" is not configured locally. Set env ${key} ` +
            `to a JSON object with that provider's keys.`,
        );
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new Error(`Env ${key} is not valid JSON`);
      }
    }
    const fromBundle = (await loadBundle()).external?.[provider];
    if (!fromBundle) {
      throw new Error(
        `External provider "${provider}" not found in SECRET_ID_BUNDLE.external. ` +
          `Add it to the bundled secret.`,
      );
    }
    return fromBundle as T;
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

  const bundleId = env().SECRET_ID_BUNDLE;
  if (!bundleId) {
    throw new Error(
      "Production boot requires SECRET_ID_BUNDLE to point at the bundled " +
        "AWS Secrets Manager secret (or set DATABASE_URL for local mode).",
    );
  }
  logger.info(
    { event: "secrets.fetch", id: bundleId },
    "Loading bundled secret from AWS Secrets Manager",
  );

  // Warm the cache and pull DB credentials. The first loadBundle() call
  // also primes app/redis/auth/aws/mail/external for the rest of the
  // process lifecycle.
  const db = await Secrets.db();

  // Inject DB URL for Prisma. Prisma reads this from process.env at client init.
  process.env.DATABASE_URL = buildDatabaseUrl(db);

  logger.info({ event: "secrets.loaded" }, "Secrets bootstrap complete");
}
