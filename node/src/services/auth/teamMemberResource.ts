import { TeamMember } from "@prisma/client";

/**
 * Mirror of App\\Http\\Resources\\TeamMemberResource. Field set preserved
 * exactly so the existing frontend / white-label consumers see no change.
 */

export interface TeamMemberDto {
  unique_id: string;
  name: string;
  email: string;
  mobile_country_code: string | null;
  mobile: string | null;
  role: number;
  permission: number;
  status: number;
  timezone: string;
  last_password_reset: string | null;
  created_at: string;
}

export function teamMemberResource(member: TeamMember): TeamMemberDto {
  return {
    unique_id: member.uniqueId,
    name: member.name,
    email: member.email,
    mobile_country_code: member.mobileCountryCode,
    mobile: member.mobile,
    role: member.role,
    permission: member.permission,
    status: member.status,
    timezone: member.timezone,
    last_password_reset: member.lastPasswordReset
      ? member.lastPasswordReset.toISOString()
      : null,
    created_at: member.createdAt ? member.createdAt.toISOString() : "",
  };
}
