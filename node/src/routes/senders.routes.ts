import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { senderController } from "../controllers/senders/senderController";
import {
  SenderFormFieldsQuerySchema,
  SenderListQuerySchema,
  SenderShowQuerySchema,
} from "../validators/senders/senderValidators";

/**
 * Mirror of /user/remitters/* group. Laravel applies a `senderAccess`
 * middleware on the parent prefix; we fold it into the standard auth +
 * onboarding check stack since `senderAccess` itself just gates by
 * users.enable_sender + merchant context (Phase 8 will add the full check
 * when its merchant settings are needed).
 */
export function sendersRoutes(): Router {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.get(
    "/get-form-fields",
    validate({ query: SenderFormFieldsQuerySchema }),
    asyncHandler(senderController.getFormFields),
  );
  r.get(
    "/list",
    validate({ query: SenderListQuerySchema }),
    asyncHandler(senderController.index),
  );
  r.post("/store", asyncHandler(senderController.store));
  r.post("/update", asyncHandler(senderController.update));
  r.get(
    "/show",
    validate({ query: SenderShowQuerySchema }),
    asyncHandler(senderController.show),
  );
  r.delete(
    "/delete",
    validate({ query: SenderShowQuerySchema }),
    asyncHandler(senderController.destroy),
  );

  // Bulk endpoints land in Phase 8 (Excel).
  r.get("/bulk/template", senderController.bulkTemplate);
  r.post("/bulk/store", senderController.bulkStore);
  return r;
}
