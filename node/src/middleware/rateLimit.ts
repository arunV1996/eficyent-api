import { Request, RequestHandler } from "express";
import rateLimit, { Options } from "express-rate-limit";
import RedisStore, { RedisReply } from "rate-limit-redis";
import { env } from "../config/env";
import { getRedis } from "../config/redis";

/**
 * Redis-backed rate limiting. Two presets mirror Laravel's `throttle` groups:
 *   - default: ~RATE_LIMIT_MAX/min per (ip, user|anonymous, route)
 *   - limited: stricter (RATE_LIMIT_LIMITED_MAX/min) for sensitive endpoints
 *     (login, OTP verify, password reset, retries, exports, cancel, etc.)
 */

async function buildStore(prefix: string): Promise<RedisStore> {
  const redis = await getRedis();
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      redis.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
    prefix,
  });
}

function keyFor(req: Request): string {
  // Authenticated user id is preferred; falls back to IP. For anonymous
  // routes (login, register) IP + email are combined where available.
  const userId = (req as Request & { user?: { id: string | number } }).user?.id;
  if (userId !== undefined) return `u:${userId}`;
  // express-rate-limit uses req.ip - we trust it when TRUST_PROXY is set
  // correctly via `app.set("trust proxy", ...)` in index.ts.
  const email =
    typeof req.body === "object" && req.body !== null
      ? String((req.body as { email?: unknown }).email ?? "")
      : "";
  return `ip:${req.ip}${email ? `:${email.toLowerCase()}` : ""}`;
}

const baseOptions = (max: number, windowMs: number): Partial<Options> => ({
  windowMs,
  max,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request): string => keyFor(req),
  validate: false,
  handler: (_req, res) =>
    res.status(429).json({
      status: false,
      code: 429,
      message: "Too many requests.",
      data: null,
    }),
});

let defaultLimiter: RequestHandler | null = null;
let limitedLimiter: RequestHandler | null = null;

export async function defaultRateLimit(): Promise<RequestHandler> {
  if (defaultLimiter) return defaultLimiter;
  const store = await buildStore("rl:default:");
  defaultLimiter = rateLimit({
    ...baseOptions(env().RATE_LIMIT_MAX, env().RATE_LIMIT_WINDOW_MS),
    store,
  });
  return defaultLimiter;
}

export async function limitedRateLimit(): Promise<RequestHandler> {
  if (limitedLimiter) return limitedLimiter;
  const store = await buildStore("rl:limited:");
  limitedLimiter = rateLimit({
    ...baseOptions(env().RATE_LIMIT_LIMITED_MAX, env().RATE_LIMIT_WINDOW_MS),
    store,
  });
  return limitedLimiter;
}
