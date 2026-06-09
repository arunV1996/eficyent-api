import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  businessUserAccess,
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { subuserController } from "../controllers/subuser/subuserController";
import {
  AcceptInviteSchema,
  SubUserShowSchema,
  SubUserStoreSchema,
} from "../validators/subuser/subuserValidators";

/**
 * Mirror of /user/subusers/* group + the public accept-invite route.
 *
 * accept-invite is anonymous (no auth) and rate-limited (`throttle:limited`).
 * The other endpoints require auth + email verification + onboarding + the
 * caller being a business user.
 */

export async function subuserPublicRoutes(): Promise<Router> {
  const r = Router();
  r.post(
    "/accept-invite",
    validate({ body: AcceptInviteSchema }),
    asyncHandler(subuserController.acceptInvite),
  );
  return r;
}

export function subuserAuthedRoutes(): Router {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    emailShouldBeVerified,
    asyncHandler(validateMerchant),
    onboardingShouldBeCompleted,
    businessUserAccess,
  );
  r.get("/list", asyncHandler(subuserController.index));
  r.post(
    "/store",
    validate({ body: SubUserStoreSchema }),
    asyncHandler(subuserController.store),
  );
  r.get(
    "/show",
    validate({ query: SubUserShowSchema }),
    asyncHandler(subuserController.show),
  );
  r.delete(
    "/delete",
    validate({ query: SubUserShowSchema }),
    asyncHandler(subuserController.destroy),
  );
  return r;
}
