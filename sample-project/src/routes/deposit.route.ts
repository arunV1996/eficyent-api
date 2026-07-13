import { Router } from "express";
import { deposit } from "../controller/deposit.controller";
import { depositApiRoutes } from "../utils/api.routes";

const router = Router();

router.post(
    depositApiRoutes.DEPOSIT.path,
    ...depositApiRoutes.DEPOSIT.middleware,
    deposit,
);

export default router;
