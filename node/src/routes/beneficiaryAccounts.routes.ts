import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
  onboardingShouldBeCompleted,
  validateMerchant,
} from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { beneficiaryAccountsController } from "../controllers/beneficiaryAccounts/beneficiaryAccountsController";
import {
  BeneficiaryListQuerySchema,
  BeneficiaryShowSchema,
  FormFieldsQuerySchema,
  ValidateAccountSchema,
} from "../validators/beneficiaryAccounts/beneficiaryAccountValidators";

export function beneficiaryAccountsRoutes(): Router {
  const r = Router();
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
  );

  r.get(
    "/get-form-fields",
    validate({ query: FormFieldsQuerySchema }),
    asyncHandler(beneficiaryAccountsController.getFormFields),
  );
  r.get(
    "/list",
    validate({ query: BeneficiaryListQuerySchema }),
    asyncHandler(beneficiaryAccountsController.index),
  );
  r.post(
    "/validate_account",
    validate({ body: ValidateAccountSchema }),
    asyncHandler(beneficiaryAccountsController.validateAccount),
  );
  r.post("/store", asyncHandler(beneficiaryAccountsController.store));
  r.get(
    "/show",
    validate({ query: BeneficiaryShowSchema }),
    asyncHandler(beneficiaryAccountsController.show),
  );
  r.delete(
    "/delete",
    validate({ query: BeneficiaryShowSchema }),
    asyncHandler(beneficiaryAccountsController.destroy),
  );

  // Bulk endpoints surface a clean 501 until Phase 8 ships ExcelImportService.
  r.get("/bulk/template", asyncHandler(beneficiaryAccountsController.bulkTemplate));
  r.post("/bulk/store", asyncHandler(beneficiaryAccountsController.bulkStore));
  return r;
}
