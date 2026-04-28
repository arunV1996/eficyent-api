import express from "express";
import http from "http";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { bootstrapSecrets } from "./config/secrets";
import { closeRedis } from "./config/redis";
import { closePrisma } from "./db/prisma";
import { logger } from "./helpers/logger";
import {
  bodySizeGuard,
  compressionMiddleware,
  corsMiddleware,
  helmetMiddleware,
  requestTimeout,
} from "./middleware/security";
import { defaultRateLimit } from "./middleware/rateLimit";
import { errorHandler, notFound } from "./middleware/error";
import { requestId } from "./middleware/requestId";
import { apiRouter } from "./routes";

async function main(): Promise<void> {
  await bootstrapSecrets();

  const app = express();

  // Trust proxy (ALB/CloudFront/etc.) so req.ip and rate-limit see the real client.
  app.set("trust proxy", env().TRUST_PROXY);
  app.disable("x-powered-by");
  app.disable("etag");

  // Order matters: id and logger first so every later step is correlated.
  app.use(requestId());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? "",
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      serializers: {
        req: (req) => ({
          id: (req as { id?: string }).id,
          method: (req as { method?: string }).method,
          url: (req as { url?: string }).url,
        }),
        res: (res) => ({ statusCode: (res as { statusCode?: number }).statusCode }),
      },
    }),
  );

  app.use(helmetMiddleware());
  app.use(corsMiddleware());
  app.use(bodySizeGuard());
  app.use(express.json({ limit: `${env().REQUEST_BODY_LIMIT_KB}kb` }));
  app.use(express.urlencoded({ extended: false, limit: `${env().REQUEST_BODY_LIMIT_KB}kb` }));
  app.use(compressionMiddleware());
  app.use(requestTimeout(30_000));
  app.use(await defaultRateLimit());

  app.use("/api", await apiRouter());

  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);

  // Slowloris hardening - ensure header/body deadlines.
  server.headersTimeout = 65_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 61_000;

  server.listen(env().PORT, () => {
    logger.info(
      { port: env().PORT, env: env().APP_ENV, version: process.version },
      "API listening",
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn({ signal }, "Shutting down");
    server.close();
    await Promise.allSettled([closePrisma(), closeRedis()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    void shutdown("uncaughtException");
  });
}

void main();
