import { Router } from "express";
import {
    convert,
    index,
    show,
    showTransaction,
    transactions,
} from "../controller/wallet.controller";
import { walletApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    walletApiRoutes.LIST.path,
    ...walletApiRoutes.LIST.middleware,
    index,
);

router.get(walletApiRoutes.SHOW.path, ...walletApiRoutes.SHOW.middleware, show);

router.post(
    walletApiRoutes.CONVERT.path,
    ...walletApiRoutes.CONVERT.middleware,
    convert,
);

router.get(
    walletApiRoutes.TRANSACTIONS_LIST.path,
    ...walletApiRoutes.TRANSACTIONS_LIST.middleware,
    transactions,
);

router.get(
    walletApiRoutes.TRANSACTIONS_SHOW.path,
    ...walletApiRoutes.TRANSACTIONS_SHOW.middleware,
    showTransaction,
);

export default router;
