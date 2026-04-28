import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { payoutRoutes } from "./payout.routes";
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

/**
 * Top-level API router. Mirrors Laravel routes/api.php structure.
 *
 *   /user/register, /user/login, /user/forgot-password/*    (Phase 1)
 *   /user/verify-otp, /user/resend-otp                      (Phase 2)
 *   /user/get_settings, /user/static-pages/*                (Phase 2 - public)
 *   /user/lookups/* (public + authed)                       (Phase 2)
 *   /user/profile, /user/setup-tfa, ...                     (Phase 2 - authed)
 *   /user/subusers/* (accept-invite public, rest authed)    (Phase 2)
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

  // Phase 1
  r.use("/user/beneficiary-transactions", payoutRoutes());

  return r;
}
