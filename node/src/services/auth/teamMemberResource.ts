import { TeamMember, User } from "@prisma/client";
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
} from "../../helpers/constants";
import { formatDate } from "../../helpers/lookups";
import { yesNo } from "../../helpers/userShaper";

/**
 * Mirror of App\\Http\\Resources\\TeamMemberResource. Field set preserved
 * exactly so the existing frontend / white-label consumers see no change.
 */

export interface TeamMemberDto {
  unique_id: string;
  name: string;
  email: string;
  role: string;
  permission: string;
  sender_enabled: string;
  is_merchant: string;
  status: string;
  created_at: string;
  sender_id?: string | null;
}

export function teamMemberResource(
  member: TeamMember,
  user?: User,
  senderUniqueId?: string | null,
): TeamMemberDto {
  let senderEnabled = "NO";
  let isMerchant = "NO";

  if (user) {
    senderEnabled =
      member.role === TEAM_MEMBER_ROLE_CORPORATE
        ? "NO"
        : yesNo(user.enableSender);
    isMerchant = yesNo(!!user.merchantId);
  }

  return {
    unique_id: member.uniqueId,
    name: member.name,
    email: member.email,
    role: teamMemberRoleLabel(member.role),
    permission: teamMemberPermissionLabel(member.permission),
    sender_enabled: senderEnabled,
    is_merchant: isMerchant,
    status: teamMemberStatusLabel(member.status),
    created_at: formatDate(member.createdAt),
    ...(member.role === TEAM_MEMBER_ROLE_CORPORATE ? { sender_id: senderUniqueId ?? null } : {}),
  };
}

function teamMemberRoleLabel(role: number): string {
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
}

function teamMemberPermissionLabel(permission: number): string {
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
}

function teamMemberStatusLabel(status: number): string {
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
}
