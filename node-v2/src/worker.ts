import dotenv from "dotenv";
import { loadSecretsIntoEnv } from "./services/secrets_manager.service";

/**
 * Dedicated worker-process entry point — run with `npm run worker`
 * (ts-node) or `node dist/worker.js` in production. Completely
 * independent of the API server (src/index.ts): neither process
 * imports the other.
 *
 * Env is loaded (dotenv + optional AWS Secrets Manager) BEFORE the
 * worker modules are imported, because each worker file connects to
 * Redis at import time with the per-queue WORKER_*_CONCURRENCY
 * settings.
 */
dotenv.config();

const startWorkerFleet = async (): Promise<void> => {
    await loadSecretsIntoEnv();

    const [{ allWorkers }, { closeQueues }] = await Promise.all([
        import("./jobs/workers"),
        import("./jobs/config"),
    ]);

    // Workers connect lazily under the hood; waitUntilReady surfaces
    // connection failures at startup instead of on the first job.
    await Promise.all(allWorkers.map((worker) => worker.waitUntilReady()));
    // eslint-disable-next-line no-console
    console.log(
        `Worker fleet running: ${allWorkers.length} workers connected to Redis (${
            process.env.REDIS_HOST || "127.0.0.1"
        }:${process.env.REDIS_PORT || "6379"}).`,
    );

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        // eslint-disable-next-line no-console
        console.log(`${signal} received — closing worker fleet...`);
        await Promise.allSettled(
            allWorkers.map((worker) => worker.close()),
        );
        await closeQueues();
        // eslint-disable-next-line no-console
        console.log("Worker fleet shut down cleanly.");
        process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("unhandledRejection", (reason) => {
        // eslint-disable-next-line no-console
        console.error("Unhandled promise rejection in worker:", reason);
    });
    process.on("uncaughtException", (error) => {
        // eslint-disable-next-line no-console
        console.error("Uncaught exception in worker:", error);
        void shutdown("uncaughtException");
    });
};

startWorkerFleet().catch((startupError) => {
    // eslint-disable-next-line no-console
    console.error("Failed to start worker fleet:", startupError);
    process.exit(1);
});
