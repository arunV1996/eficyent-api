import { Router } from "express";
import { index, quote, show, store } from "../controller/deposit.controller";
import { depositApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    depositApiRoutes.LIST.path,
    ...depositApiRoutes.LIST.middleware,
    index,
);

router.get(
    depositApiRoutes.SHOW.path,
    ...depositApiRoutes.SHOW.middleware,
    show,
);

router.get(
    depositApiRoutes.QUOTE.path,
    ...depositApiRoutes.QUOTE.middleware,
    quote,
);

router.post(
    depositApiRoutes.STORE.path,
    ...depositApiRoutes.STORE.middleware,
    store,
);

export default router;
