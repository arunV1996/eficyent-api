import { NextFunction, Request, Response } from "express";
import { ApiException } from "../helpers/errors";
import { TEAM_MEMBER_ACTIVE, TEAM_MEMBER_PERMISSION_VIEWER } from "../helpers/constants";

/**
 * Validates that a team member has at least Viewer permission.
 * Bypasses validation if the requester is a standard User/Merchant.
 */
export function allowTeamMemberViewer(
    req: Request,
    _res: Response,
    next: NextFunction,
): void {
    // If no team member is present, this is a normal user request; let it pass.
    if (!req.teamMember) {
        return next();
    }

    // If it's a team member, ensure they are active
    if (req.teamMember.status !== TEAM_MEMBER_ACTIVE) {
        return next(new ApiException(160, "Team member is inactive or disabled", 401));
    }

    // Ensure they have viewer permission or higher. 
    // In our constants, Viewer is 5, Maker/Checker are 1-4.
    // We allow <= 5 assuming all 1-5 permissions grant basic viewing rights.
    if (req.teamMember.permission > TEAM_MEMBER_PERMISSION_VIEWER || req.teamMember.permission < 1) {
        return next(new ApiException(133, "Insufficient viewer permissions", 403));
    }

    next();
}
