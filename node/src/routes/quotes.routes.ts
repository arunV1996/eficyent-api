import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { limitedRateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validateRequest";
import { quotesController } from "../controllers/quotes/quotesController";
import { QuoteStoreSchema } from "../validators/quotes/quoteValidators";
import {
  QUOTE_MODE_QUOTATION,
  QUOTE_MODE_RATE,
} from "../helpers/constants";

/**
 * Mirror of /user/quotes/*.
 *   POST /quotes/store         - mode=quotation (full quote with commissions)
 *   GET  /quotes/exchange-rate - mode=rate (rate-only, throttle:limited)
 *
 * Both routes share the same controller; the `mode` differentiates the
 * commission application as the original Laravel ::defaults('mode', ...)
 * call did.
 */
export async function quotesRoutes(): Promise<Router> {
  const r = Router();
  const limited = await limitedRateLimit();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.post(
    "/store",
    validate({ body: QuoteStoreSchema }),
    asyncHandler(quotesController(QUOTE_MODE_QUOTATION).store),
  );
  r.get(
    "/exchange-rate",
    limited,
    validate({ query: QuoteStoreSchema }),
    asyncHandler(quotesController(QUOTE_MODE_RATE).store),
  );
  return r;
}
