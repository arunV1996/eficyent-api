import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum } from "../middleware/auth";
import { limitedRateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validateRequest";
import { loginController } from "../controllers/auth/loginController";
import { registerController } from "../controllers/auth/registerController";
import { forgotPasswordController } from "../controllers/auth/forgotPasswordController";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  TfaLoginSchema,
  VerifyCodeSchema,
} from "../validators/auth/authValidators";

/**
 * Mirrors the `user/*` group from Laravel routes/api.php for auth-related
 * endpoints. Path prefix `/user` is applied by the parent router.
 */
export async function authRoutes(): Promise<Router> {
  const r = Router();
  const limited = await limitedRateLimit();

  r.post(
    "/register",
    validate({ body: RegisterSchema }),
    asyncHandler(registerController.register),
  );

  r.post(
    "/login",
    limited,
    validate({ body: LoginSchema }),
    asyncHandler(loginController.login),
  );

  r.post(
    "/tfa-login",
    limited,
    validate({ body: TfaLoginSchema }),
    asyncHandler(loginController.tfaLogin),
  );

  r.post(
    "/forgot-password/send-reset-link",
    limited,
    validate({ body: ForgotPasswordSchema }),
    asyncHandler(forgotPasswordController.sendResetLink),
  );

  r.post(
    "/forgot-password/verify-code",
    limited,
    validate({ body: VerifyCodeSchema }),
    asyncHandler(forgotPasswordController.verifyCode),
  );

  r.post(
    "/forgot-password/reset-password",
    limited,
    validate({ body: ResetPasswordSchema }),
    asyncHandler(forgotPasswordController.resetPassword),
  );

  r.post(
    "/logout",
    asyncHandler(authSanctum),
    asyncHandler(loginController.logout),
  );

  return r;
}
