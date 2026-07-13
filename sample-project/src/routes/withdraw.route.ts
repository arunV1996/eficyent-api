import { Router } from "express";
import { withdraw } from "../controller/withdraw.controller";
import { withdrawApiRoutes } from "../utils/api.routes";

const router = Router();

router.post(
    withdrawApiRoutes.WITHDRAW.path,
    ...withdrawApiRoutes.WITHDRAW.middleware,
    withdraw,
);

export default router;
