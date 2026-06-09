import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import { onboardingShouldBeCompleted, validateMerchant } from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { lookupsController } from "../controllers/lookups/lookupsController";
import {
  DepositLookupQuerySchema,
  GetBanksQuerySchema,
  ReceivingCountriesQuerySchema,
  RefreshRateBodySchema,
  StatesQuerySchema,
} from "../validators/lookups/lookupsValidators";

/**
 * Mirror of Laravel's `user/lookups/*` group.
 *
 * Public lookups (no auth) live under /user/lookups/*.
 * Authenticated lookups (receiving_countries, get-rates, refresh-rates)
 * live in the protected route group and require auth + merchant validation
 * + onboarding completion - matching the Laravel middleware stack.
 */

export async function publicLookupsRoutes(): Promise<Router> {
  const r = Router();
  r.get("/mobile_country_codes", asyncHandler(lookupsController.mobileCountryCodes));
  r.get("/countries", asyncHandler(lookupsController.countries));
  r.get(
    "/states",
    validate({ query: StatesQuerySchema }),
    asyncHandler(lookupsController.states),
  );
  r.get("/payment_rails", lookupsController.paymentRails);
  r.get(
    "/banks",
    validate({ query: GetBanksQuerySchema }),
    asyncHandler(lookupsController.banks),
  );
  r.get(
    "/deposit_lookups",
    validate({ query: DepositLookupQuerySchema }),
    asyncHandler(lookupsController.depositLookups),
  );
  r.get("/deposit_wallets", asyncHandler(lookupsController.depositWallets));
  return r;
}

export async function authedLookupsRoutes(): Promise<Router> {
  const r = Router();

  r.get(
    "/receiving_countries",
    asyncHandler(authSanctum),
    emailShouldBeVerified,
    asyncHandler(validateMerchant),
    onboardingShouldBeCompleted,
    validate({ query: ReceivingCountriesQuerySchema }),
    asyncHandler(lookupsController.receivingCountries),
  );

  r.get(
    "/get-rates",
    asyncHandler(authSanctum),
    emailShouldBeVerified,
    asyncHandler(validateMerchant),
    onboardingShouldBeCompleted,
    asyncHandler(lookupsController.getRates),
  );

  r.post(
    "/refresh-rates",
    asyncHandler(authSanctum),
    emailShouldBeVerified,
    asyncHandler(validateMerchant),
    onboardingShouldBeCompleted,
    validate({ body: RefreshRateBodySchema }),
    asyncHandler(lookupsController.refreshRates),
  );

  return r;
}
