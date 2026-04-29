import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { limitedRateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validateRequest";
import { ledgerController } from "../controllers/ledgers/ledgerController";
import {
  LedgerListSchema,
  LedgerShowSchema,
} from "../validators/ledgers/ledgerValidators";

export async function ledgersRoutes(): Promise<Router> {
  const r = Router();
  const limited = await limitedRateLimit();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );
  r.get(
    "/list",
    validate({ query: LedgerListSchema }),
    asyncHandler(ledgerController.index),
  );
  r.get(
    "/show",
    validate({ query: LedgerShowSchema }),
    asyncHandler(ledgerController.show),
  );
  r.get(
    "/export",
    limited,
    validate({ query: LedgerListSchema }),
    ledgerController.export,
  );
  return r;
}
