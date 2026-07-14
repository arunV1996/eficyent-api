import { Router } from "express";
import {
    activate,
    balances,
    getBalance,
    getVirtualAccounts,
    index,
    listAvailableBanks,
    show,
} from "../controller/virtual_account.controller";
import { virtualAccountApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    virtualAccountApiRoutes.LIST.path,
    ...virtualAccountApiRoutes.LIST.middleware,
    index,
);

router.get(
    virtualAccountApiRoutes.SHOW.path,
    ...virtualAccountApiRoutes.SHOW.middleware,
    show,
);

router.get(
    virtualAccountApiRoutes.AVAILABLE_BANKS.path,
    ...virtualAccountApiRoutes.AVAILABLE_BANKS.middleware,
    listAvailableBanks,
);

router.post(
    virtualAccountApiRoutes.ACTIVATE.path,
    ...virtualAccountApiRoutes.ACTIVATE.middleware,
    activate,
);

router.get(
    virtualAccountApiRoutes.GET_ACCOUNT_BALANCE.path,
    ...virtualAccountApiRoutes.GET_ACCOUNT_BALANCE.middleware,
    getBalance,
);

router.get(
    virtualAccountApiRoutes.GET_VIRTUAL_ACCOUNTS.path,
    ...virtualAccountApiRoutes.GET_VIRTUAL_ACCOUNTS.middleware,
    getVirtualAccounts,
);

router.get(
    virtualAccountApiRoutes.BALANCES.path,
    ...virtualAccountApiRoutes.BALANCES.middleware,
    balances,
);

export default router;
