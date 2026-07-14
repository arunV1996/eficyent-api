import { Router } from "express";
import authRoutes from "./auth.route";
import beneficiaryAccountRoutes from "./beneficiary_account.route";
import lookupRoutes from "./lookup.route";
import onboardingRoutes from "./onboarding.route";
import profileRoutes from "./profile.route";

const router = Router();

// Path prefix `/user` matches the legacy /node routes/api.php grouping.
// Multiple sub-routers can share this prefix — Express walks them in order.
router.use("/user", authRoutes);
router.use("/user", profileRoutes);
router.use("/user/lookups", lookupRoutes);
router.use("/user/onboarding", onboardingRoutes);
router.use("/user/beneficiaries", beneficiaryAccountRoutes);

export default router;
