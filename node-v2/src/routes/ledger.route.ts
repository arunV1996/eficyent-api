import { Router } from "express";
import { exportLedgers, index, show } from "../controller/ledger.controller";
import { ledgerApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    ledgerApiRoutes.LIST.path,
    ...ledgerApiRoutes.LIST.middleware,
    index,
);

router.get(ledgerApiRoutes.SHOW.path, ...ledgerApiRoutes.SHOW.middleware, show);

router.get(
    ledgerApiRoutes.EXPORT.path,
    ...ledgerApiRoutes.EXPORT.middleware,
    exportLedgers,
);

export default router;
