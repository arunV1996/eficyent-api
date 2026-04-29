import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validateRequest";
import { staticPagesController } from "../controllers/staticPages/staticPagesController";
import { StaticPageShowSchema } from "../validators/staticPages/staticPagesValidators";

export function staticPagesRoutes(): Router {
  const r = Router();
  r.get("/list", asyncHandler(staticPagesController.index));
  r.get(
    "/show",
    validate({ query: StaticPageShowSchema }),
    asyncHandler(staticPagesController.show),
  );
  return r;
}
