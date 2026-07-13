import { Queue, Worker, ConnectionOptions } from "bullmq";
import { processPendingTransactions } from "./transaction.job";

const connectionOptions: ConnectionOptions = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    maxRetriesPerRequest: null,
};

export const transactionQueue = new Queue("transactionQueue", {
    connection: connectionOptions,
});

export const initJobs = async (): Promise<void> => {
    console.log("[Jobs] Initializing queues and workers...");

    // Create the worker to process queue jobs
    const worker = new Worker(
        "transactionQueue",
        async (job) => {
            if (job.name === "checkPendingTransactions") {
                await processPendingTransactions();
            }
        },
        {
            connection: connectionOptions,
        },
    );

    worker.on("completed", (job) => {
        console.log(`[Jobs] Job ${job.id} completed successfully.`);
    });

    worker.on("failed", (job, err) => {
        console.error(`[Jobs] Job ${job?.id} failed:`, err);
    });

    // Add repeatable job to scan database every minute
    // Utilizing jobId to prevent duplicate repeat schedule registrations on restart
    await transactionQueue.add(
        "checkPendingTransactions",
        {},
        {
            repeat: {
                pattern: "* * * * *", // runs every minute
            },
            jobId: "repeat-check-pending-transactions",
        },
    );

    console.log(
        "[Jobs] Repeatable transaction status check scheduled successfully.",
    );
};
