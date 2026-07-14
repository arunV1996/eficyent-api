import { Router } from "express";
import { getCredentials } from "../controller/auth.controller";
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

// Moved from auth.route.ts to match the legacy grouping; the full path
// (/api/user/get-credentials) is unchanged because both routers mount
// under /user.
router.get(
    profileApiRoutes.GET_CREDENTIALS.path,
    ...profileApiRoutes.GET_CREDENTIALS.middleware,
    getCredentials,
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
