import Redis from "ioredis";

/**
 * Single shared ioredis connection for sessions / rate limits.
 * Configuration: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (optional).
 */

let client: Redis | null = null;

export const getRedis = (): Redis => {
    if (client) {
        return client;
    }
    client = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        ...(process.env.REDIS_PASSWORD
            ? { password: process.env.REDIS_PASSWORD }
            : {}),
        maxRetriesPerRequest: 2,
    });
    return client;
};

export const closeRedis = async (): Promise<void> => {
    if (client) {
        await client.quit();
        client = null;
    }
};
