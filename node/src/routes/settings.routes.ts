import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { settingsController } from "../controllers/settings/settingsController";

export function settingsRoutes(): Router {
  const r = Router();
  r.get("/get_settings", asyncHandler(settingsController.getAppSettings));
  return r;
}
