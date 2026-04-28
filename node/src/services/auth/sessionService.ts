import { getRedis } from "../../config/redis";
import { env } from "../../config/env";

/**
 * Redis-backed session lifecycle for opaque tokens.
 *
 * Two TTLs are enforced:
 *   - inactivity TTL (sliding) - bumped on every authenticated request
 *   - absolute TTL (fixed)     - hard cap from issue time
 *
 * Layout per token:
 *   sess:{userId}:{tokenId}        STRING    issuedAtMs (absolute floor)
 *   sess:idx:{userId}              SET       member = tokenId  (for fan-out revoke)
 */

function key(userId: bigint, tokenId: bigint): string {
  return `sess:${userId.toString()}:${tokenId.toString()}`;
}
function idxKey(userId: bigint): string {
  return `sess:idx:${userId.toString()}`;
}

export const sessionService = {
  async start(userId: bigint, tokenId: bigint, customTtlSeconds: number | null): Promise<void> {
    const r = await getRedis();
    const inactivity = env().SESSION_INACTIVITY_TTL_SECONDS;
    const absolute = customTtlSeconds ?? env().SESSION_ABSOLUTE_TTL_SECONDS;
    const issuedAt = Date.now();
    const expireAt = issuedAt + absolute * 1000;
    const pipeline = r.pipeline();
    pipeline.set(key(userId, tokenId), String(expireAt), "EX", inactivity);
    pipeline.sadd(idxKey(userId), tokenId.toString());
    pipeline.expire(idxKey(userId), absolute);
    await pipeline.exec();
  },

  async touch(userId: bigint, tokenId: bigint): Promise<boolean> {
    const r = await getRedis();
    const k = key(userId, tokenId);
    const expireAt = await r.get(k);
    if (!expireAt) return false;
    const expireMs = Number(expireAt);
    if (!Number.isFinite(expireMs) || Date.now() > expireMs) {
      await this.end(userId, tokenId);
      return false;
    }
    await r.expire(k, env().SESSION_INACTIVITY_TTL_SECONDS);
    return true;
  },

  async end(userId: bigint, tokenId: bigint): Promise<void> {
    const r = await getRedis();
    const pipeline = r.pipeline();
    pipeline.del(key(userId, tokenId));
    pipeline.srem(idxKey(userId), tokenId.toString());
    await pipeline.exec();
  },

  async endAll(userId: bigint): Promise<void> {
    const r = await getRedis();
    const ids = await r.smembers(idxKey(userId));
    const pipeline = r.pipeline();
    for (const id of ids) pipeline.del(key(userId, BigInt(id)));
    pipeline.del(idxKey(userId));
    await pipeline.exec();
  },
};
