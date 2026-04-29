import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { payoutPublicRoutes, payoutRoutes } from "./payout.routes";
import { settingsRoutes } from "./settings.routes";
import { staticPagesRoutes } from "./staticPages.routes";
import {
  authedLookupsRoutes,
  publicLookupsRoutes,
} from "./lookups.routes";
import { profileRoutes } from "./profile.routes";
import {
  subuserAuthedRoutes,
  subuserPublicRoutes,
} from "./subuser.routes";
import { onboardingRoutes } from "./onboarding.routes";
import { virtualAccountsRoutes } from "./virtualAccounts.routes";
import { beneficiaryAccountsRoutes } from "./beneficiaryAccounts.routes";
import { sendersRoutes } from "./senders.routes";
import { quotesRoutes } from "./quotes.routes";
import { walletsRoutes } from "./wallets.routes";
import { depositsRoutes, retryDepositRoute } from "./deposits.routes";
import { ledgersRoutes } from "./ledgers.routes";

/**
 * Top-level API router. Mirrors Laravel routes/api.php structure.
 *
 *   /user/register, /user/login, /user/forgot-password/*    (Phase 1)
 *   /user/verify-otp, /user/resend-otp                      (Phase 2)
 *   /user/get_settings, /user/static-pages/*                (Phase 2 - public)
 *   /user/lookups/* (public + authed)                       (Phase 2)
 *   /user/profile, /user/setup-tfa, ...                     (Phase 2 - authed)
 *   /user/subusers/* (accept-invite public, rest authed)    (Phase 2)
 *   /user/onboarding/get-form-fields, /stepTwo, /stepThree  (Phase 3)
 *   /user/accounts/*                                        (Phase 3 - virtual accounts)
 *   /user/beneficiaries/*                                   (Phase 3 - beneficiary accounts)
 *   /user/beneficiary-transactions/store                    (Phase 1)
 */
export async function apiRouter(): Promise<Router> {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ status: true, code: 200, message: "ok", data: null });
  });

  // Auth + email verification
  r.use("/user", await authRoutes());

  // Public Phase 2 endpoints (no auth)
  r.use("/user", settingsRoutes());
  r.use("/user/static-pages", staticPagesRoutes());
  r.use("/user/lookups", await publicLookupsRoutes());
  r.use("/user/subusers", await subuserPublicRoutes());

  // Authenticated Phase 2 endpoints
  r.use("/user", await profileRoutes());
  r.use("/user/lookups", await authedLookupsRoutes());
  r.use("/user/subusers", subuserAuthedRoutes());

  // Phase 3 endpoints
  r.use("/user/onboarding", onboardingRoutes());
  r.use("/user/accounts", virtualAccountsRoutes());
  r.use("/user/beneficiaries", beneficiaryAccountsRoutes());

  // Phase 4 endpoints
  r.use("/user/remitters", sendersRoutes());
  r.use("/user/quotes", await quotesRoutes());
  r.use("/user/wallets", await walletsRoutes());

  // Phase 5 endpoints
  r.use("/user/deposits", await depositsRoutes());
  r.use("/user/ledgers", await ledgersRoutes());
  r.use("/user", await retryDepositRoute());

  // Phase 6 - full BeneficiaryTransaction surface
  r.use("/user/beneficiary-transactions", await payoutRoutes());
  r.use("/user", await payoutPublicRoutes());

  return r;
}
