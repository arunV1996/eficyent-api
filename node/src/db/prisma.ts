import { PrismaClient } from "@prisma/client";
import { logger } from "../helpers/logger";

let client: PrismaClient | null = null;

export const PRISMA_TX_OPTIONS = {
  maxWait: 120000,   // Time in ms to wait for a database connection from the pool (default 2s)
  timeout: 120000,  // Time in ms before Prisma closes/rolls back the interactive transaction (default 5s)
};

/**
 * Single PrismaClient per process. PrismaClient already manages its own
 * connection pool against MySQL; we never instantiate more than one.
 *
 * DATABASE_URL must be set in process.env before this is called - that
 * happens in bootstrapSecrets() via secrets.ts.
 */
export function prisma(): PrismaClient {
  if (client) return client;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set - bootstrap secrets before using prisma()");
  }
  client = new PrismaClient({
    log: [
      { level: "warn", emit: "event" },
      { level: "error", emit: "event" },
    ],
  });

  // Global override for interactive transactions to enforce default pool maxWait and query timeout
  const originalTransaction = client.$transaction.bind(client);
  client.$transaction = function (args: any, options?: any) {
    if (typeof args === "function") {
      const mergedOptions = {
        maxWait: options?.maxWait ?? PRISMA_TX_OPTIONS.maxWait,
        timeout: options?.timeout ?? PRISMA_TX_OPTIONS.timeout,
        ...options,
      };
      return originalTransaction(args, mergedOptions);
    }
    return originalTransaction(args, options);
  } as any;

  client.$on("warn" as never, (e: unknown) => logger.warn({ prisma: e }, "Prisma warn"));
  client.$on("error" as never, (e: unknown) => logger.error({ prisma: e }, "Prisma error"));
  return client;
}

export async function closePrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
