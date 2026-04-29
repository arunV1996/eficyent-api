import { NextFunction, Request, Response } from "express";
import { TeamMember } from "@prisma/client";
import { ApiException } from "../helpers/errors";
import { teamTokenService } from "../services/auth/teamTokenService";
import { prisma } from "../db/prisma";
import {
  TEAM_MEMBER_DISABLED,
  TEAM_MEMBER_INACTIVE,
  TEAM_MEMBER_PERMISSION_CHECKER,
  TEAM_MEMBER_PERMISSION_INITIATOR,
  TEAM_MEMBER_PERMISSION_MAKER,
  TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
  TEAM_MEMBER_ROLE_OWNER,
} from "../helpers/constants";

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    teamMember?: TeamMember;
  }
}

const BEARER_RE = /^Bearer\s+(.+)$/i;

/**
 * Express equivalent of Laravel `auth:team`.
 *
 * On success populates:
 *   req.teamMember - the TeamMember row
 *   req.user       - the parent business User row (so user-scoped
 *                    controllers and services keep working transparently)
 *   req.tokenId    - the personal_access_tokens.id used to authenticate
 *
 * On failure returns 401.
 */
export async function authTeam(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header) throw new ApiException(401, undefined, 401);
    const match = BEARER_RE.exec(header);
    if (!match) throw new ApiException(401, undefined, 401);

    const result = await teamTokenService.authenticate(match[1]!);
    if (!result) throw new ApiException(401, undefined, 401);

    if (
      result.member.status === TEAM_MEMBER_INACTIVE ||
      result.member.status === TEAM_MEMBER_DISABLED
    ) {
      throw new ApiException(160, undefined, 401);
    }

    const parent = await prisma().user.findUnique({
      where: { id: result.member.userId },
    });
    if (!parent || parent.deletedAt) throw new ApiException(102, undefined, 401);

    req.teamMember = result.member;
    req.user = parent;
    req.tokenId = result.tokenId;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Mirror of Api\\Middleware\\PasswordReset for team members. Blocks
 * authenticated requests until the team member has set their initial
 * password (last_password_reset is non-null).
 */
export function teamPasswordResetGate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.teamMember) return next(new ApiException(102, undefined, 401));
  if (!req.teamMember.lastPasswordReset) {
    return next(new ApiException(133, undefined, 401));
  }
  next();
}

/**
 * Mirror of Api\\Middleware\\OwnerAccess.
 */
export function ownerAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.teamMember) return next(new ApiException(401, undefined, 401));
  if (req.teamMember.role !== TEAM_MEMBER_ROLE_OWNER) {
    return next(new ApiException(133, undefined, 401));
  }
  next();
}

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
 * Mirror of Api\\Middleware\\MakerAccess. Permission allowlist preserved
 * exactly: MAKER, MAKER_CHECKER, INITIATOR.
 */
export function makerAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.teamMember) return next(new ApiException(401, undefined, 401));
  if (!MAKER_PERMISSIONS.has(req.teamMember.permission)) {
    return next(new ApiException(133, undefined, 401));
  }
  next();
}

/**
 * Mirror of Api\\Middleware\\CheckerAccess. Permission allowlist preserved
 * exactly: CHECKER, MAKER_CHECKER, MAKER (the Laravel CheckerAccess does
 * include MAKER - matching that even though it looks unusual).
 */
export function checkerAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.teamMember) return next(new ApiException(401, undefined, 401));
  if (!CHECKER_PERMISSIONS.has(req.teamMember.permission)) {
    return next(new ApiException(133, undefined, 401));
  }
  next();
}
