import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum } from "../middleware/auth";
import { validateMerchant } from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { teamMemberCrudController } from "../controllers/team/teamMemberController";
import {
  TeamMemberCreateSchema,
  TeamMemberListSchema,
  TeamMemberShowSchema,
  TeamMemberUpdateSchema,
} from "../validators/team/teamMemberCrudValidators";

/**
 * Mirror of TeamMember CRUD endpoints under /user namespace.
 * Mounted at /api/user/team-members.
 */
export function teamMemberRoutes(): Router {
  const r = Router();

  r.use(asyncHandler(authSanctum), asyncHandler(validateMerchant));

  r.get(
    "/list",
    validate({ query: TeamMemberListSchema }),
    asyncHandler(teamMemberCrudController.index),
  );
  r.post(
    "/create",
    validate({ body: TeamMemberCreateSchema }),
    asyncHandler(teamMemberCrudController.store),
  );
  r.get(
    "/show",
    validate({ query: TeamMemberShowSchema }),
    asyncHandler(teamMemberCrudController.show),
  );
  r.post(
    "/update",
    validate({ body: TeamMemberUpdateSchema }),
    asyncHandler(teamMemberCrudController.update),
  );
  r.post(
    "/update-status",
    validate({ body: TeamMemberShowSchema }),
    asyncHandler(teamMemberCrudController.updateStatus),
  );
  r.delete(
    "/delete",
    validate({ query: TeamMemberShowSchema }),
    asyncHandler(teamMemberCrudController.destroy),
  );

  return r;
}
