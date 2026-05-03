import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { dashboardController } from "../controllers/dashboard/dashboardController";
import {
  ChartsDataQuerySchema,
  StatisticsQuerySchema,
} from "../validators/dashboard/dashboardValidators";

/**
 * Mirror of:
 *   GET /user/dashboard/statistics
 *   GET /user/dashboard/charts-data
 *
 * Both endpoints sit behind:
 *   - Sanctum auth (req.user)
 *   - validateMerchant (ensures the X-Merchant-Id header matches an
 *     active merchant when integrators are involved)
 *   - emailShouldBeVerified
 *   - onboardingShouldBeCompleted
 *
 * The Laravel route group also has `appSignature` gating the entire
 * post-2FA scope. That middleware exists in the Node port but isn't
 * mounted on this group yet (deferred until merchants migrate to
 * signing) - same as the rest of the post-onboarding routes.
 */
export async function dashboardRoutes(): Promise<Router> {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.get(
    "/statistics",
    validate({ query: StatisticsQuerySchema }),
    asyncHandler(dashboardController.statistics),
  );
  r.get(
    "/charts-data",
    validate({ query: ChartsDataQuerySchema }),
    asyncHandler(dashboardController.chartsData),
  );

  return r;
}
