import { Router } from "express";
import { getAppSettings } from "../controller/setting.controller";
import { settingApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    settingApiRoutes.GET_SETTINGS.path,
    ...settingApiRoutes.GET_SETTINGS.middleware,
    getAppSettings,
);

export default router;
