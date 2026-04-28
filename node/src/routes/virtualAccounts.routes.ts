import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { virtualAccountsController } from "../controllers/virtualAccounts/virtualAccountsController";
import {
  ActivateSchema,
  VirtualAccountIdSchema,
  VirtualAccountListSchema,
} from "../validators/virtualAccounts/virtualAccountValidators";

export function virtualAccountsRoutes(): Router {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );
  r.get(
    "/list",
    validate({ query: VirtualAccountListSchema }),
    asyncHandler(virtualAccountsController.index),
  );
  r.get(
    "/show",
    validate({ query: VirtualAccountIdSchema }),
    asyncHandler(virtualAccountsController.show),
  );
  r.get("/available_banks", asyncHandler(virtualAccountsController.availableBanks));
  r.post(
    "/activate",
    validate({ body: ActivateSchema }),
    asyncHandler(virtualAccountsController.activate),
  );
  r.get(
    "/get_account_balance",
    validate({ query: VirtualAccountIdSchema }),
    asyncHandler(virtualAccountsController.getBalance),
  );
  r.get("/get_virtual_Accounts", asyncHandler(virtualAccountsController.getVirtualAccounts));
  r.get("/balances", asyncHandler(virtualAccountsController.balances));
  return r;
}
