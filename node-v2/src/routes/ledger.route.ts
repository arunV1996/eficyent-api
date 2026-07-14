import { Router } from "express";
import { index, show } from "../controller/ledger.controller";
import { ledgerApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    ledgerApiRoutes.LIST.path,
    ...ledgerApiRoutes.LIST.middleware,
    index,
);

router.get(ledgerApiRoutes.SHOW.path, ...ledgerApiRoutes.SHOW.middleware, show);

export default router;
