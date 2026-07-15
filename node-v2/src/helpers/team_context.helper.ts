import { Request } from "express";
import {
    TEAM_MEMBER_ACTIVE,
    TEAM_MEMBER_PERMISSION_CHECKER,
    TEAM_MEMBER_PERMISSION_INITIATOR,
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    TEAM_MEMBER_PERMISSION_VIEWER,
} from "../utils/constants";

/**
 * Corporate/team request context shared by the business controllers.
 */

export interface TeamRequestContext {
    id: number;
    role: number;
    permission: number;
    senderId: number | null;
}

/**
 * The plain creator/scoping context extracted from req.teamMember
 * (null for regular user tokens) — the shape the payout engine and
 * list filters accept.
 */
export const teamMemberContext = (req: Request): TeamRequestContext | null => {
    if (!req.teamMember) {
        return null;
    }
    return {
        id: req.teamMember.id,
        role: req.teamMember.role,
        permission: req.teamMember.permission,
        senderId: req.teamMember.senderId,
    };
};

const VIEWER_PERMISSIONS = [
    TEAM_MEMBER_PERMISSION_INITIATOR,
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_PERMISSION_CHECKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    TEAM_MEMBER_PERMISSION_VIEWER,
];

/**
 * Mirror of the legacy getEffectiveUserId: validates the team member's
 * viewer access and resolves the parent user id (team callers act on
 * behalf of the business user).
 */
export const getEffectiveUserId = (req: Request): number => {
    if (req.teamMember) {
        if (req.teamMember.status !== TEAM_MEMBER_ACTIVE) {
            throw new Error("Unauthorized: Team member is not active");
        }
        if (!VIEWER_PERMISSIONS.includes(req.teamMember.permission)) {
            throw new Error("Unauthorized: Insufficient viewer permissions");
        }
        if (!req.user) {
            throw new Error(
                "Unauthorized: Parent user not found for team member",
            );
        }
        return req.user.id;
    }
    if (req.user) {
        return req.user.id;
    }
    throw new Error("Unauthorized: No authenticated user found");
};
