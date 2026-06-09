import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { idempotency } from "../middleware/idempotency";
import { validate } from "../middleware/validateRequest";
import { walletController } from "../controllers/wallets/walletController";
import {
  ConvertSchema,
  WalletListQuerySchema,
  WalletShowSchema,
  WalletTransactionShowSchema,
  WalletTransactionsQuerySchema,
} from "../validators/wallets/walletValidators";

/**
 * Mirror of /user/wallets/* and /user/wallets/transactions/*.
 *
 * `convert` is rate-limited and idempotency-required - it moves money from a
 * virtual account into a wallet, so the same protections that apply to
 * payouts apply here.
 */
export async function walletsRoutes(): Promise<Router> {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.get(
    "/list",
    validate({ query: WalletListQuerySchema }),
    asyncHandler(walletController.index),
  );
  r.get(
    "/show",
    validate({ query: WalletShowSchema }),
    asyncHandler(walletController.show),
  );
  r.post(
    "/convert",
    idempotency(),
    validate({ body: ConvertSchema }),
    asyncHandler(walletController.convert),
  );

  r.get(
    "/transactions/list",
    validate({ query: WalletTransactionsQuerySchema }),
    asyncHandler(walletController.transactions),
  );
  r.get(
    "/transactions/show",
    validate({ query: WalletTransactionShowSchema }),
    asyncHandler(walletController.showTransaction),
  );
  return r;
}
