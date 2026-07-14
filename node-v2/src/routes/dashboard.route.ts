import { Router } from "express";
import { chartsData, statistics } from "../controller/dashboard.controller";
import { dashboardApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    dashboardApiRoutes.STATISTICS.path,
    ...dashboardApiRoutes.STATISTICS.middleware,
    statistics,
);

router.get(
    dashboardApiRoutes.CHARTS_DATA.path,
    ...dashboardApiRoutes.CHARTS_DATA.middleware,
    chartsData,
);

export default router;
