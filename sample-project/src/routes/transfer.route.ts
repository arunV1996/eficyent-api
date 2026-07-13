import { Router } from "express";
import { transfer } from "../controller/transfer.controller";
import { transferApiRoutes } from "../utils/api.routes";

const router = Router();

router.post(
    transferApiRoutes.TRANSFER.path,
    ...transferApiRoutes.TRANSFER.middleware,
    transfer,
);

export default router;
