import { Router } from "express";
import authRoutes from "./auth.route";
import profileRoutes from "./profile.route";

const router = Router();

// Path prefix `/user` matches the legacy /node routes/api.php grouping.
// Multiple sub-routers can share this prefix — Express walks them in order.
router.use("/user", authRoutes);
router.use("/user", profileRoutes);

export default router;
