import { Router } from "express";
import {
    destroy,
    index,
    show,
    store,
    update,
    updateStatus,
} from "../controller/team_member.controller";
import { authSanctum } from "../middleware/auth";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import { strictBody } from "../middleware/strictBody";
import { validateMerchant } from "../middleware/validateMerchant";
import {
    TEAM_MEMBER_CREATE_ALLOWED_KEYS,
    TEAM_MEMBER_UPDATE_ALLOWED_KEYS,
    teamMemberCreateBodyValidator,
    teamMemberListQueryValidator,
    teamMemberShowBodyValidator,
    teamMemberShowQueryValidator,
    teamMemberUpdateBodyValidator,
} from "../validators/team.validator";

/**
 * TeamMember CRUD under the /user namespace (mirror of the legacy
 * teamMember.routes.ts). Mounted at /api/user/team-members.
 */

const router = Router();

router.use(authSanctum, validateMerchant);

router.get(
    "/list",
    ...teamMemberListQueryValidator,
    checkValidationErrors,
    index,
);
router.post(
    "/create",
    strictBody(TEAM_MEMBER_CREATE_ALLOWED_KEYS),
    ...teamMemberCreateBodyValidator,
    checkValidationErrors,
    store,
);
router.get(
    "/show",
    ...teamMemberShowQueryValidator,
    checkValidationErrors,
    show,
);
router.post(
    "/update",
    strictBody(TEAM_MEMBER_UPDATE_ALLOWED_KEYS),
    ...teamMemberUpdateBodyValidator,
    checkValidationErrors,
    update,
);
router.post(
    "/update-status",
    ...teamMemberShowBodyValidator,
    checkValidationErrors,
    updateStatus,
);
router.delete(
    "/delete",
    ...teamMemberShowQueryValidator,
    checkValidationErrors,
    destroy,
);

export default router;
