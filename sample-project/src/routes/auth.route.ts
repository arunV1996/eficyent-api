import { Router } from "express";
import { register, login } from "../controller/auth.controller";
import { authApiRoutes } from "../utils/api.routes";

const router = Router();

router.post(
    authApiRoutes.REGISTER.path,
    ...authApiRoutes.REGISTER.middleware,
    register,
);
router.post(authApiRoutes.LOGIN.path, ...authApiRoutes.LOGIN.middleware, login);

export default router;
