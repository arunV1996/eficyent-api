import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { validate } from "../middleware/validateRequest";
import { payoutController } from "../controllers/payout/payoutController";
import { PayoutStoreSchema } from "../validators/payout/payoutValidators";

/**
 * Beneficiary transaction (payout) routes. Idempotency is mandatory on every
 * mutation here. Authentication + email-verified are enforced before
 * idempotency so we have a known req.user to scope the key by.
 */
export function payoutRoutes(): Router {
  const r = Router();

  r.post(
    "/store",
    asyncHandler(authSanctum),
    emailShouldBeVerified,
    idempotency(),
    validate({ body: PayoutStoreSchema }),
    asyncHandler(payoutController.store),
  );

  // Future: list, show, cancel, retry, direct, instant, bulk - all with
  // idempotency() applied to the mutating ones.

  return r;
}
