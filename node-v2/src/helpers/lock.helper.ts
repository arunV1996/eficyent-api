import { getRedis } from "../config/redis";

/**
 * Redis distributed lock, mirror of Laravel's $cache->lock()->block():
 * SET NX with a TTL, polled until the block timeout, released only by
 * the owner (compare-and-delete Lua script).
 */

export class LockTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LockTimeoutError";
    }
}

export const withRedisLock = async <T>(
    key: string,
    ttlSeconds: number,
    blockTimeoutSeconds: number,
    fn: () => Promise<T>,
): Promise<T> => {
    const redis = getRedis();
    const lockKey = `eficyent:lock:${key}`;
    const owner =
        Math.random().toString(36).substring(2, 15) + Date.now().toString();

    const startTime = Date.now();
    const timeoutMs = blockTimeoutSeconds * 1000;

    let acquired = false;
    while (Date.now() - startTime < timeoutMs) {
        const result = await redis.set(lockKey, owner, "EX", ttlSeconds, "NX");
        if (result === "OK") {
            acquired = true;
            break;
        }
        // Poll every 250ms.
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!acquired) {
        throw new LockTimeoutError(
            `Failed to acquire lock for ${key} within ${blockTimeoutSeconds}s`,
        );
    }

    try {
        return await fn();
    } finally {
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        await redis.eval(script, 1, lockKey, owner);
    }
};
