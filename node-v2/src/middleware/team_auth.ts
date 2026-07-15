import { NextFunction, Request, Response } from "express";
import { authenticateTeamToken } from "../helpers/team_token.helper";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import {
    TEAM_MEMBER_DISABLED,
    TEAM_MEMBER_INACTIVE,
    TEAM_MEMBER_PERMISSION_CHECKER,
    TEAM_MEMBER_PERMISSION_INITIATOR,
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    TEAM_MEMBER_ROLE_OWNER,
} from "../utils/constants";

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            teamMember?: TeamMember;
        }
    }
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

const TEAM_ACCESS_DENIED_MESSAGE =
    "Only business users can access this resource.";

/**
 * Express equivalent of Laravel `auth:team` (mirror of the legacy
 * authTeam). On success populates:
 *   req.teamMember - the TeamMember row
 *   req.user       - the parent business User row, so user-scoped
 *                    controllers and helpers run unchanged
 *   req.tokenId    - the personal_access_tokens.id
 */
export const authTeam = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const header = req.header("authorization");
        if (!header) {
            return res.sendError(res.__("401"), 401, 401);
        }
        const match = BEARER_PATTERN.exec(header);
        if (!match) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const result = await authenticateTeamToken(match[1]!);
        if (!result) {
            return res.sendError(res.__("401"), 401, 401);
        }

        if (
            result.member.status === TEAM_MEMBER_INACTIVE ||
            result.member.status === TEAM_MEMBER_DISABLED
        ) {
            return res.sendError("Team member is inactive.", 160, 401);
        }

        const parent = await User.unscoped().findByPk(result.member.userId);
        if (!parent || parent.deletedAt) {
            return res.sendError(res.__("102"), 102, 401);
        }

        req.teamMember = result.member;
        req.user = parent;
        req.tokenId = result.tokenId;
        next();
    } catch (error) {
        res.handleError(error);
    }
};

/**
 * Blocks authenticated requests until the team member has set their
 * initial password (mirror of the legacy teamPasswordResetGate).
 */
export const teamPasswordResetGate = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.teamMember) {
        return res.sendError(res.__("102"), 102, 401);
    }
    if (!req.teamMember.lastPasswordReset) {
        return res.sendError(TEAM_ACCESS_DENIED_MESSAGE, 133, 401);
    }
    next();
};

/**
 * Mirror of Api\Middleware\OwnerAccess.
 */
export const ownerAccess = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.teamMember) {
        return res.sendError(res.__("401"), 401, 401);
    }
    if (req.teamMember.role !== TEAM_MEMBER_ROLE_OWNER) {
        return res.sendError(TEAM_ACCESS_DENIED_MESSAGE, 133, 401);
    }
    next();
};

const MAKER_PERMISSIONS = new Set([
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    TEAM_MEMBER_PERMISSION_INITIATOR,
]);

const CHECKER_PERMISSIONS = new Set([
    TEAM_MEMBER_PERMISSION_CHECKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    TEAM_MEMBER_PERMISSION_MAKER,
]);

/**
 * Mirror of Api\Middleware\MakerAccess (MAKER, MAKER_CHECKER,
 * INITIATOR).
 */
export const makerAccess = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.teamMember) {
        return res.sendError(res.__("401"), 401, 401);
    }
    if (!MAKER_PERMISSIONS.has(req.teamMember.permission)) {
        return res.sendError(TEAM_ACCESS_DENIED_MESSAGE, 133, 401);
    }
    next();
};

/**
 * Mirror of Api\Middleware\CheckerAccess — the allowlist includes
 * MAKER, matching the unusual upstream Laravel behavior exactly.
 */
export const checkerAccess = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.teamMember) {
        return res.sendError(res.__("401"), 401, 401);
    }
    if (!CHECKER_PERMISSIONS.has(req.teamMember.permission)) {
        return res.sendError(TEAM_ACCESS_DENIED_MESSAGE, 133, 401);
    }
    next();
};
