import { Router } from "express";
import { exportStatement } from "../controller/statement.controller";
import { statementApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    statementApiRoutes.EXPORT.path,
    ...statementApiRoutes.EXPORT.middleware,
    exportStatement,
);

export default router;
