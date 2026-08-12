import { Router } from "express";
import {
    checkExternalServiceStatus,
    retryExternalService,
    retryJob,
} from "../controller/beneficiary_transaction.controller";
import { retryDeposit } from "../controller/deposit.controller";
import { merchantBalances } from "../controller/user.controller";
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

userPublicRouter.get(
    publicApiRoutes.MERCHANT_BALANCES.path,
    ...publicApiRoutes.MERCHANT_BALANCES.middleware,
    merchantBalances,
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
