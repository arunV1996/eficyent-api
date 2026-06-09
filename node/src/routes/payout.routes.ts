import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { idempotency } from "../middleware/idempotency";
import { validate } from "../middleware/validateRequest";
import { payoutController } from "../controllers/payout/payoutController";
import {
  GetFormFieldsSchema,
  InstantPayoutSchema,
  PayoutCancelSchema,
  PayoutListQuerySchema,
  PayoutShowSchema,
  PayoutStoreSchema,
  PayoutUpdateStatusSchema,
  RetryJobParamSchema,
  RetryParamSchema,
  SendMoneyDirectSchema,
  TransactionProofGetSchema,
  TransactionProofRequestSchema,
} from "../validators/payout/payoutValidators";

/**
 * Mirror of /user/beneficiary-transactions/* + the public /user/retry_*
 * and /user/check_external_service_status routes from routes/api.php.
 *
 * Money-moving endpoints (store, direct, instant, cancel, update-status,
 * retry-job, retry_external_service) are rate-limited AND
 * idempotency-required. The defense-in-depth pattern matches deposits/store
 * and wallets/convert.
 */
export async function payoutRoutes(): Promise<Router> {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.get(
    "/list",
    validate({ query: PayoutListQuerySchema }),
    asyncHandler(payoutController.index),
  );
  r.post(
    "/store",
    idempotency(),
    validate({ body: PayoutStoreSchema }),
    asyncHandler(payoutController.store),
  );
  r.get(
    "/show",
    validate({ query: PayoutShowSchema }),
    asyncHandler(payoutController.show),
  );
  r.get(
    "/check_transaction_status",
    validate({ query: PayoutShowSchema }),
    asyncHandler(payoutController.checkTransactionStatus),
  );
  r.get(
    "/check_status",
    validate({ query: PayoutShowSchema }),
    asyncHandler(payoutController.checkStatus),
  );
  r.post(
    "/update-status",
    idempotency(),
    validate({ body: PayoutUpdateStatusSchema }),
    asyncHandler(payoutController.updateStatus),
  );
  r.post(
    "/cancel",
    idempotency(),
    validate({ body: PayoutCancelSchema }),
    asyncHandler(payoutController.cancel),
  );
  r.get(
    "/export",
    validate({ query: PayoutShowSchema }),
    payoutController.export,
  );
  r.get("/download", payoutController.downloadList);

  r.get(
    "/get-form-fields",
    validate({ query: GetFormFieldsSchema }),
    asyncHandler(payoutController.getFormFields),
  );
  r.post(
    "/direct",
    idempotency(),
    validate({ body: SendMoneyDirectSchema }),
    asyncHandler(payoutController.direct),
  );

  r.get("/bulk/template", asyncHandler(payoutController.payoutTemplate));
  r.post("/bulk/store", asyncHandler(payoutController.bulkStore));

  r.get(
    "/instant/get-form-fields",
    validate({ query: GetFormFieldsSchema }),
    asyncHandler(payoutController.instantGetFormFields),
  );
  r.post(
    "/instant/store",
    idempotency(),
    validate({ body: InstantPayoutSchema }),
    asyncHandler(payoutController.instant),
  );

  r.get(
    "/transaction-form-fields",
    asyncHandler(payoutController.transactionFormFields),
  );

  r.post(
    "/request-proof",
    validate({ body: TransactionProofRequestSchema }),
    asyncHandler(payoutController.requestProof),
  );
  r.get(
    "/get-proof",
    validate({ query: TransactionProofGetSchema }),
    asyncHandler(payoutController.getProof),
  );

  return r;
}

/**
 * Public retry / status routes mounted at /user/* in Laravel - no auth.
 * Both rate-limited.
 */
export async function payoutPublicRoutes(): Promise<Router> {
  const r = Router();
  r.post(
    "/retry-job/:jobId",
    validate({ params: RetryJobParamSchema }),
    asyncHandler(payoutController.retryJob),
  );
  r.get(
    "/check_external_service_status/:trxn",
    validate({ params: RetryParamSchema }),
    asyncHandler(payoutController.checkExternalServiceStatus),
  );
  return r;
}

export async function retryExternalServiceRoute(): Promise<Router> {
  const r = Router();
  r.post(
    "/retry_external_service/:trxn",
    validate({ params: RetryParamSchema }),
    asyncHandler(payoutController.retryExternalService),
  );
  return r;
}
