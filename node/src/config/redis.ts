import IORedis, { Redis } from "ioredis";
import { Secrets } from "./secrets";
import { logger } from "../helpers/logger";

let primary: Redis | null = null;
let bull: Redis | null = null;

/**
 * Application Redis client (sessions, idempotency, rate-limit, app cache).
 * Uses ioredis with connection pulled from Secrets Manager.
 */
export async function getRedis(): Promise<Redis> {
  if (primary && primary.status === "ready") return primary;
  const s = await Secrets.redis();
  primary = new IORedis({
    host: s.host,
    port: s.port,
    password: s.password,
    username: s.username,
    db: s.db ?? 0,
    tls: s.tls ? {} : undefined,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    keepAlive: 10_000,
  });
  primary.on("error", (err) => {
    logger.error({ err, scope: "redis.primary" }, "Redis error");
  });
  return primary;
}

/**
 * Separate Redis connection for BullMQ.
 *
 * BullMQ requires its own connection because it uses blocking commands
 * (BRPOPLPUSH, etc). Sharing the connection with app traffic causes head-of-
 * line blocking. maxRetriesPerRequest must be null per BullMQ requirement.
 */
export async function getBullConnection(): Promise<Redis> {
  if (bull && bull.status === "ready") return bull;
  const s = await Secrets.redis();
  bull = new IORedis({
    host: s.host,
    port: s.port,
    password: s.password,
    username: s.username,
    db: s.db ?? 0,
    tls: s.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  bull.on("error", (err) => {
    logger.error({ err, scope: "redis.bull" }, "BullMQ Redis error");
  });
  return bull;
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([primary?.quit(), bull?.quit()]);
  primary = null;
  bull = null;
}
