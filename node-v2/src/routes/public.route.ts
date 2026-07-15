import { Router } from "express";
import {
    checkExternalServiceStatus,
    retryExternalService,
    retryJob,
} from "../controller/beneficiary_transaction.controller";
import { retryDeposit } from "../controller/deposit.controller";
import { publicApiRoutes } from "../utils/api.routes";

/**
 * Public retry / status routes (mirror of the legacy
 * payoutPublicRoutes at /user and retryDepositRoute at /public — no
 * auth middleware, same as Laravel).
 */

export const userPublicRouter = Router();

userPublicRouter.post(
    publicApiRoutes.RETRY_JOB.path,
    ...publicApiRoutes.RETRY_JOB.middleware,
    retryJob,
);

userPublicRouter.get(
    publicApiRoutes.CHECK_EXTERNAL_SERVICE_STATUS.path,
    ...publicApiRoutes.CHECK_EXTERNAL_SERVICE_STATUS.middleware,
    checkExternalServiceStatus,
);

export const publicRouter = Router();

publicRouter.post(
    publicApiRoutes.RETRY_DEPOSIT.path,
    ...publicApiRoutes.RETRY_DEPOSIT.middleware,
    retryDeposit,
);

publicRouter.post(
    publicApiRoutes.RETRY_EXTERNAL_SERVICE.path,
    ...publicApiRoutes.RETRY_EXTERNAL_SERVICE.middleware,
    retryExternalService,
);
