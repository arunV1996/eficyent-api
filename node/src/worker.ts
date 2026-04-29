import { bootstrapSecrets } from "./config/secrets";
import { closeRedis } from "./config/redis";
import { closePrisma } from "./db/prisma";
import { logger } from "./helpers/logger";
import { closeQueues } from "./queues/queues";
import { registerCrons } from "./queues/cron";
import { startWorkers, stopWorkers } from "./workers";

async function main(): Promise<void> {
  await bootstrapSecrets();
  await registerCrons();
  await startWorkers();

  logger.info({ env: process.env.APP_ENV ?? "production" }, "Worker process running");

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn({ signal }, "Worker shutting down");
    await stopWorkers();
    await Promise.allSettled([closeQueues(), closePrisma(), closeRedis()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection in worker");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception in worker");
    void shutdown("uncaughtException");
  });
}

void main();
