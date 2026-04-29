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

async function fetchSecret<T>(secretId: string): Promise<T> {
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

export const Secrets = {
  async app(): Promise<AppSecret> {
    return fetchSecret<AppSecret>(env().SECRET_ID_APP);
  },
  async db(): Promise<DbSecret> {
    return fetchSecret<DbSecret>(env().SECRET_ID_DB);
  },
  async redis(): Promise<RedisSecret> {
    return fetchSecret<RedisSecret>(env().SECRET_ID_REDIS);
  },
  async auth(): Promise<AuthSecret> {
    return fetchSecret<AuthSecret>(env().SECRET_ID_AUTH);
  },
  async aws(): Promise<AwsSecret> {
    return fetchSecret<AwsSecret>(env().SECRET_ID_AWS);
  },
  async mail(): Promise<MailSecret> {
    return fetchSecret<MailSecret>(env().SECRET_ID_MAIL);
  },
  async external<T extends Record<string, unknown>>(provider: string): Promise<T> {
    const id = `${env().SECRET_ID_EXTERNAL_PREFIX}/${provider}`;
    return fetchSecret<T>(id);
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
