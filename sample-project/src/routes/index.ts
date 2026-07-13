import { Router } from "express";
import authRoutes from "./auth.route";
import depositRoutes from "./deposit.route";
import withdrawRoutes from "./withdraw.route";
import transferRoutes from "./transfer.route";

const router = Router();

router.use("/auth", authRoutes);
router.use("/deposit", depositRoutes);
router.use("/withdraw", withdrawRoutes);
router.use("/transfer", transferRoutes);

export default router;
