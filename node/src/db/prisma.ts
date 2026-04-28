import { PrismaClient } from "@prisma/client";
import { logger } from "../helpers/logger";

let client: PrismaClient | null = null;

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
