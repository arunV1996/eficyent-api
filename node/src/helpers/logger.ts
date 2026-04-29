import pino from "pino";

/**
 * Structured logger with PII redaction. Never logs request bodies; never
 * logs response bodies. Field names below are common PII / secrets that
 * must NEVER appear in logs even if accidentally added to a context object.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "req.headers['x-merchant-signature']",
  "req.headers['idempotency-key']",
  "*.password",
  "*.password_confirmation",
  "*.token",
  "*.access_token",
  "*.refresh_token",
  "*.api_key",
  "*.secret",
  "*.tfa_secret",
  "*.private_key",
  "*.public_key",
  "*.salt_key",
  "*.email_code",
  "*.account_number",
  "*.card_number",
  "*.cvv",
  "*.iban",
  "*.routing_number",
  "*.swift_code",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.APP_NAME ?? "eficyent-api",
    env: process.env.APP_ENV ?? "production",
  },
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
