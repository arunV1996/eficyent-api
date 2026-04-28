import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import { validateMerchant } from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { onboardingController } from "../controllers/onboarding/onboardingController";
import { GetFormFieldsSchema } from "../validators/onboarding/onboardingValidators";

/**
 * Mirror of /user/onboarding/*. Auth + email verified are enforced at the
 * router level matching the Laravel middleware stack.
 */
export function onboardingRoutes(): Router {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
  );

  r.get(
    "/get-form-fields",
    validate({ query: GetFormFieldsSchema }),
    asyncHandler(onboardingController.getFormFields),
  );
  r.post("/stepTwo", asyncHandler(onboardingController.stepTwo));
  r.post("/stepThree", asyncHandler(onboardingController.stepThree));
  return r;
}
