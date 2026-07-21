import dotenv from "dotenv";
import { loadSecretsIntoEnv } from "./services/secrets_manager.service";

/**
 * Bootstrap entry point.
 *
 * Several modules (config/database.ts and friends) read process.env at
 * import time, so the AWS Secrets Manager bundle must be merged into
 * process.env BEFORE app.ts and its import graph load. The dynamic
 * import below defers that graph until the secrets are in place; when
 * Secrets Manager is not configured the app starts on .env alone.
 */
dotenv.config();

loadSecretsIntoEnv()
    .then(() => import("./app"))
    .catch((bootstrapError) => {
        // eslint-disable-next-line no-console
        console.error("Failed to bootstrap application:", bootstrapError);
        process.exit(1);
    });
