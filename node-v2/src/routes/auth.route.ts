import { Router } from "express";
import { login, logout, register } from "../controller/auth.controller";
import { authApiRoutes } from "../utils/api.routes";

const router = Router();

router.post(
    authApiRoutes.REGISTER.path,
    ...authApiRoutes.REGISTER.middleware,
    register,
);

router.post(
    authApiRoutes.LOGIN.path,
    ...authApiRoutes.LOGIN.middleware,
    login,
);

router.post(
    authApiRoutes.LOGOUT.path,
    ...authApiRoutes.LOGOUT.middleware,
    logout,
);

export default router;
