import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const trueSet = new Set(["1", "true", "yes", "on"]);
const boolish = (def = false) =>
  z
    .union([z.string(), z.boolean(), z.undefined()])
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (v === undefined || v === "") return def;
      return trueSet.has(String(v).toLowerCase());
    });

const numberFromString = (def: number) =>
  z
    .union([z.string(), z.number(), z.undefined()])
    .transform((v) => {
      if (typeof v === "number") return v;
      if (v === undefined || v === "") return def;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new Error(`expected number, got ${String(v)}`);
      }
      return n;
    });

const trustProxy = z
  .union([z.string(), z.undefined()])
  .transform((v) => {
    if (v === undefined || v === "") return 0 as number | boolean;
    if (v === "true") return true;
    if (v === "false") return false;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  });

const envSchema = z.object({
  NODE_ENV: z.string().default("production"),
  APP_NAME: z.string().default("Eficyent"),
  APP_ENV: z.string().default("production"),
  APP_DEBUG: boolish(false),
  APP_URL: z.string().url().default("http://localhost:8080"),
  PORT: numberFromString(8080),
  TRUST_PROXY: trustProxy,
  APP_IS_SANDBOX: boolish(false),

  AWS_REGION: z.string().default("us-east-1"),
  KMS_KEY_ID: z.string().min(1),

  SECRET_ID_APP: z.string().min(1),
  SECRET_ID_DB: z.string().min(1),
  SECRET_ID_REDIS: z.string().min(1),
  SECRET_ID_AUTH: z.string().min(1),
  SECRET_ID_AWS: z.string().min(1),
  SECRET_ID_MAIL: z.string().min(1),
  SECRET_ID_EXTERNAL_PREFIX: z.string().min(1),
  SECRETS_CACHE_TTL_MS: numberFromString(5 * 60_000),

  DATABASE_URL: z.string().optional(),

  LOG_LEVEL: z.string().default("info"),

  CORS_ORIGINS: z.string().default(""),
  RATE_LIMIT_WINDOW_MS: numberFromString(60_000),
  RATE_LIMIT_MAX: numberFromString(120),
  RATE_LIMIT_LIMITED_MAX: numberFromString(10),
  REQUEST_BODY_LIMIT_KB: numberFromString(1024),

  SESSION_TTL_SECONDS: numberFromString(86_400),
  SESSION_INACTIVITY_TTL_SECONDS: numberFromString(3_600),
  SESSION_ABSOLUTE_TTL_SECONDS: numberFromString(604_800),
  TOKEN_BYTES: numberFromString(40),

  IDEMPOTENCY_TTL_SECONDS: numberFromString(86_400),

  BULLMQ_PREFIX: z.string().default("eficyent"),

  BULLMQ_PAYOUT_CONCURRENCY: numberFromString(8),
  BULLMQ_DEPOSIT_CONCURRENCY: numberFromString(8),
  BULLMQ_COMPLIANCE_CONCURRENCY: numberFromString(4),
  BULLMQ_REMITTANCE_CONCURRENCY: numberFromString(4),
  BULLMQ_BENEFICIARY_VALIDATION_CONCURRENCY: numberFromString(4),
  BULLMQ_FX_RATES_CONCURRENCY: numberFromString(1),
  BULLMQ_CALLBACK_CONCURRENCY: numberFromString(8),
  BULLMQ_FVBANK_VA_CONCURRENCY: numberFromString(2),
  BULLMQ_INVOICEMATE_CONCURRENCY: numberFromString(2),
  BULLMQ_BULK_PAYOUT_CONCURRENCY: numberFromString(2),
  BULLMQ_USER_ALERT_CONCURRENCY: numberFromString(2),

  BULLMQ_DEFAULT_ATTEMPTS: numberFromString(5),
  BULLMQ_DEFAULT_BACKOFF_MS: numberFromString(2_000),

  USD_TO_AED: numberFromString(2.67),

  CRON_FX_RATES: z.string().default("*/30 * * * *"),
  CRON_CHECK_BENEFICIARY_TXN_STATUS: z.string().default("*/5 * * * *"),
  CRON_DIGININE_COUNTRY_SYNC: z.string().default("0 3 * * *"),
  CRON_FETCH_FVBANK_VA: z.string().default("*/15 * * * *"),
  CRON_PAYOUT_JOB_REAPER: z.string().default("*/2 * * * *"),
  CRON_LEADER_HOST: z.string().default(""),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${messages}`);
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}
