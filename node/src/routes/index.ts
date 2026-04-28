import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { payoutRoutes } from "./payout.routes";

/**
 * Top-level API router.
 *
 * Path layout mirrors Laravel routes/api.php:
 *   /user/*                 -> auth, profile, etc.
 *   /user/beneficiary-transactions/* -> payouts (auth + idempotency required)
 *
 * Modules added in subsequent phases will be mounted here.
 */
export async function apiRouter(): Promise<Router> {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ status: true, code: 200, message: "ok", data: null });
  });

  r.use("/user", await authRoutes());
  r.use("/user/beneficiary-transactions", payoutRoutes());

  return r;
}
