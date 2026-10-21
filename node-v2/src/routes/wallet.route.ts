import { Router } from "express";
import {
    convert,
    index,
    show,
    showTransaction,
    wallet_to_bank,
    bank_to_wallet,
    transactions,
} from "../controller/wallet.controller";
import { walletApiRoutes } from "../utils/api.routes";
import {
    authSanctum,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
} from "../middleware/auth";
import { idempotency } from "../middleware/idempotency";
import { strictBody } from "../middleware/strictBody";

const walletBase = [
    authSanctum,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
    idempotency(),
    strictBody(["wallet_id", "quote_id"]),
];

const router = Router();

router.get(
    walletApiRoutes.LIST.path,
    ...walletApiRoutes.LIST.middleware,
    index,
);

router.get(walletApiRoutes.SHOW.path, ...walletApiRoutes.SHOW.middleware, show);

router.post(
    walletApiRoutes.CONVERT.path,
    ...walletBase,
    convert,
);

router.get(
    walletApiRoutes.TRANSACTIONS_LIST.path,
    ...walletApiRoutes.TRANSACTIONS_LIST.middleware,
    transactions,
);

router.get(
    walletApiRoutes.TRANSACTIONS_SHOW.path,
    ...walletApiRoutes.TRANSACTIONS_SHOW.middleware,
    showTransaction,
);

// Note: Middleware can be added here mirroring api.routes if needed
router.post("/to-bank", ...walletBase, wallet_to_bank);

router.post("/to-wallet", ...walletApiRoutes.CONVERT.middleware, bank_to_wallet);

export default router;
