import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import { validateMerchant } from "../middleware/access";
import { limitedRateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validateRequest";
import { profileController } from "../controllers/profile/profileController";
import {
  ChangePasswordSchema,
  DeleteAccountSchema,
  PasswordVerificationSchema,
  RegenerateBackupCodesSchema,
  UpdateProfileSchema,
} from "../validators/profile/profileValidators";

/**
 * Mirror of the profile section under /user/* in Laravel routes/api.php.
 * The order of middleware matches the original:
 *   auth:sanctum -> ValidateMerchant -> (action-specific middleware)
 */
export async function profileRoutes(): Promise<Router> {
  const r = Router();
  const limited = await limitedRateLimit();

  // get-credentials is special: requires email_should_be_verified but NOT
  // ValidateMerchant in the Laravel routes file.
  r.get(
    "/get-credentials",
    asyncHandler(authSanctum),
    emailShouldBeVerified,
    limited,
    asyncHandler(profileController.getCredentials),
  );

  // All others sit under auth + ValidateMerchant.
  r.use(
    asyncHandler(authSanctum),
    asyncHandler(validateMerchant),
  );

  r.get("/profile", asyncHandler(profileController.profile));
  r.post(
    "/delete-account",
    validate({ body: DeleteAccountSchema }),
    asyncHandler(profileController.deleteAccount),
  );
  r.get("/check_user_status", asyncHandler(profileController.checkUserStatus));
  r.post(
    "/change-password",
    validate({ body: ChangePasswordSchema }),
    asyncHandler(profileController.changePassword),
  );
  r.get("/setup-tfa", asyncHandler(profileController.setupTfa));
  r.post(
    "/tfa-status",
    validate({ body: PasswordVerificationSchema }),
    asyncHandler(profileController.tfaStatus),
  );
  r.post(
    "/regenerate-backup-codes",
    validate({ body: RegenerateBackupCodesSchema }),
    asyncHandler(profileController.regenerateBackupCodes),
  );
  r.post("/update-tour-status", asyncHandler(profileController.updateTourStatus));
  r.get(
    "/update-profile-form-fields",
    profileController.updateProfileFormFields,
  );
  r.post(
    "/update-profile",
    validate({ body: UpdateProfileSchema }),
    asyncHandler(profileController.updateProfile),
  );
  return r;
}
