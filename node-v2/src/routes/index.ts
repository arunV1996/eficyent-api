import { Router } from "express";
import authRoutes from "./auth.route";

const router = Router();

// Path prefix `/user` matches the legacy /node routes/api.php grouping.
router.use("/user", authRoutes);

export default router;
