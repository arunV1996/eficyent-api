import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import { formatDateHuman, yesNo } from "../utils/common.utils";
import {
    TEAM_MEMBER_ACTIVE,
    TEAM_MEMBER_DISABLED,
    TEAM_MEMBER_INACTIVE,
    TEAM_MEMBER_PERMISSION_CHECKER,
    TEAM_MEMBER_PERMISSION_INITIATOR,
    TEAM_MEMBER_PERMISSION_MAKER,
    TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    TEAM_MEMBER_ROLE_ADMIN,
    TEAM_MEMBER_ROLE_CORPORATE,
    TEAM_MEMBER_ROLE_OWNER,
    TEAM_MEMBER_ROLE_SUPPORT_MEMBER,
} from "../utils/constants";

/**
 * Mirror of the legacy teamMemberResource: label mapping for
 * role/permission/status, parent-user flags, and the corporate-only
 * sender_id key.
 */

export const teamMemberRoleLabel = (role: number): string => {
    switch (role) {
        case TEAM_MEMBER_ROLE_ADMIN:
            return "ADMIN";
        case TEAM_MEMBER_ROLE_OWNER:
            return "OWNER";
        case TEAM_MEMBER_ROLE_SUPPORT_MEMBER:
            return "TEAM_MEMBER";
        case TEAM_MEMBER_ROLE_CORPORATE:
            return "CORPORATE";
        default:
            return "TEAM_MEMBER";
    }
};

export const teamMemberPermissionLabel = (permission: number): string => {
    switch (permission) {
        case TEAM_MEMBER_PERMISSION_INITIATOR:
            return "INITIATOR";
        case TEAM_MEMBER_PERMISSION_MAKER:
            return "CREATOR";
        case TEAM_MEMBER_PERMISSION_CHECKER:
            return "APPROVER";
        case TEAM_MEMBER_PERMISSION_MAKER_CHECKER:
            return "CREATOR_AND_APPROVER";
        default:
            return "";
    }
};

export const teamMemberStatusLabel = (status: number): string => {
    switch (status) {
        case TEAM_MEMBER_ACTIVE:
            return "ACTIVE";
        case TEAM_MEMBER_INACTIVE:
            return "INACTIVE";
        case TEAM_MEMBER_DISABLED:
            return "DISABLED";
        default:
            return "INACTIVE";
    }
};

export const teamMemberToJSON = (
    member: TeamMember,
    user?: User | null,
    senderUniqueId?: string | null,
    businessModel = "mto",
): Record<string, unknown> => {
    let senderEnabled = "NO";
    let isMerchant = "NO";

    if (user) {
        senderEnabled =
            member.role === TEAM_MEMBER_ROLE_CORPORATE
                ? "NO"
                : yesNo(user.enableSender);
        isMerchant = yesNo(Boolean(user.merchantId));
    }

    return {
        unique_id: member.uniqueId,
        name: member.name,
        email: member.email,
        role: teamMemberRoleLabel(member.role),
        permission: teamMemberPermissionLabel(member.permission),
        sender_enabled: senderEnabled,
        is_merchant: isMerchant,
        business_model: businessModel.toLowerCase(),
        status: teamMemberStatusLabel(member.status),
        created_at: formatDateHuman(
            member.createdAt,
            user?.timezone || "Asia/Kolkata",
        ),
        ...(member.role === TEAM_MEMBER_ROLE_CORPORATE
            ? { sender_id: senderUniqueId ?? null }
            : {}),
    };
};
