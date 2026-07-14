import { Router } from "express";
import { makeQuoteStore } from "../controller/quote.controller";
import { quoteApiRoutes } from "../utils/api.routes";
import {
    QUOTE_MODE_QUOTATION,
    QUOTE_MODE_RATE,
} from "../utils/constants";

const router = Router();

router.post(
    quoteApiRoutes.STORE.path,
    ...quoteApiRoutes.STORE.middleware,
    makeQuoteStore(QUOTE_MODE_QUOTATION),
);

router.get(
    quoteApiRoutes.EXCHANGE_RATE.path,
    ...quoteApiRoutes.EXCHANGE_RATE.middleware,
    makeQuoteStore(QUOTE_MODE_RATE),
);

export default router;
