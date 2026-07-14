import { Router } from "express";
import {
    changePassword,
    profile,
    updateTourStatus,
} from "../controller/profile.controller";
import { profileApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    profileApiRoutes.PROFILE.path,
    ...profileApiRoutes.PROFILE.middleware,
    profile,
);

router.post(
    profileApiRoutes.CHANGE_PASSWORD.path,
    ...profileApiRoutes.CHANGE_PASSWORD.middleware,
    changePassword,
);

router.post(
    profileApiRoutes.UPDATE_TOUR_STATUS.path,
    ...profileApiRoutes.UPDATE_TOUR_STATUS.middleware,
    updateTourStatus,
);

export default router;
