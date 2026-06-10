import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { idempotency } from "../middleware/idempotency";
import { validate } from "../middleware/validateRequest";
import { depositController } from "../controllers/deposits/depositController";
import {
  DepositCreateSchema,
  DepositListQuerySchema,
  DepositQuoteSchema,
  DepositShowSchema,
  DepositTrxnParamSchema,
} from "../validators/deposits/depositValidators";

/**
 * Mirror of /user/deposits/* + the public /user/retry_deposit/{trxn} route.
 * Like wallets/convert and beneficiary-transactions/store, deposits/store
 * is rate-limited AND idempotency-required - it moves money.
 */
export async function depositsRoutes(): Promise<Router> {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.get(
    "/list",
    validate({ query: DepositListQuerySchema }),
    asyncHandler(depositController.index),
  );
  r.get(
    "/show",
    validate({ query: DepositShowSchema }),
    asyncHandler(depositController.show),
  );
  r.get(
    "/quote",
    validate({ query: DepositQuoteSchema }),
    asyncHandler(depositController.quote),
  );
  r.post(
    "/store",
    idempotency(),
    validate({ body: DepositCreateSchema }),
    asyncHandler(depositController.store),
  );
  r.get("/export", depositController.export);
  return r;
}

/**
 * Public retry_deposit endpoint - throttled, no auth (mirror Laravel route).
 */
export async function retryDepositRoute(): Promise<Router> {
  const r = Router();
  r.post(
    "/retry_deposit/:trxn",
    validate({ params: DepositTrxnParamSchema }),
    asyncHandler(depositController.retryDeposit),
  );
  return r;
}
