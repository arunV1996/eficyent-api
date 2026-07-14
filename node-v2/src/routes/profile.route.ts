import { Router } from "express";
import { getCredentials } from "../controller/auth.controller";
import {
    changePassword,
    checkUserStatus,
    deleteAccount,
    profile,
    regenerateBackupCodes,
    setupTfa,
    tfaStatus,
    updateProfile,
    updateProfileFormFields,
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

router.post(
    profileApiRoutes.DELETE_ACCOUNT.path,
    ...profileApiRoutes.DELETE_ACCOUNT.middleware,
    deleteAccount,
);

router.get(
    profileApiRoutes.CHECK_USER_STATUS.path,
    ...profileApiRoutes.CHECK_USER_STATUS.middleware,
    checkUserStatus,
);

router.get(
    profileApiRoutes.SETUP_TFA.path,
    ...profileApiRoutes.SETUP_TFA.middleware,
    setupTfa,
);

router.post(
    profileApiRoutes.TFA_STATUS.path,
    ...profileApiRoutes.TFA_STATUS.middleware,
    tfaStatus,
);

router.post(
    profileApiRoutes.REGENERATE_BACKUP_CODES.path,
    ...profileApiRoutes.REGENERATE_BACKUP_CODES.middleware,
    regenerateBackupCodes,
);

router.get(
    profileApiRoutes.UPDATE_PROFILE_FORM_FIELDS.path,
    ...profileApiRoutes.UPDATE_PROFILE_FORM_FIELDS.middleware,
    updateProfileFormFields,
);

router.post(
    profileApiRoutes.UPDATE_PROFILE.path,
    ...profileApiRoutes.UPDATE_PROFILE.middleware,
    updateProfile,
);

export default router;
