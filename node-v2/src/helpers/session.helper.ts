import { getRedis } from "../config/redis";

/**
 * Redis-backed session lifecycle for opaque tokens (mirror of the
 * legacy sessionService — same key layout, so sessions started by
 * either service are honored by both):
 *
 *   sess:{userId}:{tokenId}   STRING  absolute-expiry ms (sliding TTL)
 *   sess:idx:{userId}         SET     tokenIds for fan-out revoke
 *
 * Env: SESSION_INACTIVITY_TTL_SECONDS (default 3600),
 *      SESSION_ABSOLUTE_TTL_SECONDS (default 604800).
 */

const inactivityTtlSeconds = (): number =>
    parseInt(process.env.SESSION_INACTIVITY_TTL_SECONDS || "3600", 10);
const absoluteTtlSeconds = (): number =>
    parseInt(process.env.SESSION_ABSOLUTE_TTL_SECONDS || "604800", 10);

const sessionKey = (userId: number, tokenId: number): string =>
    `sess:${userId}:${tokenId}`;
const indexKey = (userId: number): string => `sess:idx:${userId}`;

export const startSession = async (
    userId: number,
    tokenId: number,
    customTtlSeconds: number | null,
): Promise<void> => {
    const redis = getRedis();
    const inactivity = inactivityTtlSeconds();
    const absolute = customTtlSeconds ?? absoluteTtlSeconds();
    const expireAtMs = Date.now() + absolute * 1000;
    const pipeline = redis.pipeline();
    pipeline.set(sessionKey(userId, tokenId), String(expireAtMs), "EX", inactivity);
    pipeline.sadd(indexKey(userId), String(tokenId));
    pipeline.expire(indexKey(userId), absolute);
    await pipeline.exec();
};

/** Sliding-TTL touch; false = session missing or hard-expired. */
export const touchSession = async (
    userId: number,
    tokenId: number,
): Promise<boolean> => {
    const redis = getRedis();
    const key = sessionKey(userId, tokenId);
    const expireAt = await redis.get(key);
    if (!expireAt) {
        return false;
    }
    const expireAtMs = Number(expireAt);
    if (!Number.isFinite(expireAtMs) || Date.now() > expireAtMs) {
        await endSession(userId, tokenId);
        return false;
    }
    await redis.expire(key, inactivityTtlSeconds());
    return true;
};

export const endSession = async (
    userId: number,
    tokenId: number,
): Promise<void> => {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    pipeline.del(sessionKey(userId, tokenId));
    pipeline.srem(indexKey(userId), String(tokenId));
    await pipeline.exec();
};
