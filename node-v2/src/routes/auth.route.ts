import { Router } from "express";
import {
    getCredentials,
    login,
    logout,
    register,
    tfaLogin,
} from "../controller/auth.controller";
import {
    resetPassword,
    sendResetLink,
    verifyCode,
} from "../controller/forgot_password.controller";
import { resendOtp, verifyOtp } from "../controller/verify_email.controller";
import { authApiRoutes } from "../utils/api.routes";

const router = Router();

router.post(
    authApiRoutes.REGISTER.path,
    ...authApiRoutes.REGISTER.middleware,
    register,
);

router.post(
    authApiRoutes.VERIFY_OTP.path,
    ...authApiRoutes.VERIFY_OTP.middleware,
    verifyOtp,
);

router.post(
    authApiRoutes.RESEND_OTP.path,
    ...authApiRoutes.RESEND_OTP.middleware,
    resendOtp,
);

router.post(
    authApiRoutes.LOGIN.path,
    ...authApiRoutes.LOGIN.middleware,
    login,
);

router.post(
    authApiRoutes.TFA_LOGIN.path,
    ...authApiRoutes.TFA_LOGIN.middleware,
    tfaLogin,
);

router.post(
    authApiRoutes.FORGOT_SEND_LINK.path,
    ...authApiRoutes.FORGOT_SEND_LINK.middleware,
    sendResetLink,
);

router.post(
    authApiRoutes.FORGOT_VERIFY_CODE.path,
    ...authApiRoutes.FORGOT_VERIFY_CODE.middleware,
    verifyCode,
);

router.post(
    authApiRoutes.FORGOT_RESET_PASSWORD.path,
    ...authApiRoutes.FORGOT_RESET_PASSWORD.middleware,
    resetPassword,
);

router.post(
    authApiRoutes.LOGOUT.path,
    ...authApiRoutes.LOGOUT.middleware,
    logout,
);

router.get(
    authApiRoutes.GET_CREDENTIALS.path,
    ...authApiRoutes.GET_CREDENTIALS.middleware,
    getCredentials,
);

export default router;
