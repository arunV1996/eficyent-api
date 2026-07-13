import { Request } from "express";
import {
    TEAM_MEMBER_ACTIVE,
    TEAM_MEMBER_PERMISSION_VIEWER,
    TEAM_MEMBER_PERMISSION_INITIATOR,
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_PERMISSION_CHECKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER
} from "../helpers/constants";

/**
 * Validates team member viewer permissions and extracts the effective user ID.
 * Safely resolves the parent Merchant/User ID if a valid Team Member is making the request.
 */
export function getEffectiveUserId(req: Request): bigint {
    if (req.teamMember) {
        if (req.teamMember.status !== TEAM_MEMBER_ACTIVE) {
            throw new Error("Unauthorized: Team member is not active");
        }

        // Allow if they are Viewer OR any higher privileged role (1,2,3,4)
        const allowedPermissions = [
            TEAM_MEMBER_PERMISSION_INITIATOR,
            TEAM_MEMBER_PERMISSION_MAKER,
            TEAM_MEMBER_PERMISSION_CHECKER,
            TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
            TEAM_MEMBER_PERMISSION_VIEWER
        ];

        if (!allowedPermissions.includes(req.teamMember.permission)) {
            throw new Error("Unauthorized: Insufficient viewer permissions");
        }

        // req.user is set to the parent user by the teamAuth middleware
        if (!req.user) {
            throw new Error("Unauthorized: Parent user not found for team member");
        }

        return req.user.id;
    }

    // Standard Merchant/User
    if (req.user) {
        return req.user.id;
    }

    throw new Error("Unauthorized: No authenticated user found");
}
