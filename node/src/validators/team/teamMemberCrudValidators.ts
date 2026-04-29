import { z } from "zod";
import {
  TEAM_MEMBER_STATUS_MAP,
  USER_PERMISSION_MAP,
  USER_ROLE_MAP,
} from "../../helpers/constants";
import { PASSWORD_REGEX } from "../../helpers/lookups";

const role = z.enum(Object.keys(USER_ROLE_MAP) as [string, ...string[]]);
const permission = z.enum(
  Object.keys(USER_PERMISSION_MAP) as [string, ...string[]],
);

export const TeamMemberCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    email: z.string().trim().toLowerCase().email().max(255),
    role,
    permission,
    password: z.string().min(8).max(128).regex(PASSWORD_REGEX),
    password_confirmation: z.string().min(8).max(128),
    mobile_country_code: z.string().regex(/^\d{1,7}$/).optional(),
    mobile: z.string().regex(/^\d{8,15}$/).optional(),
    remitter_id: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((v) => v.password === v.password_confirmation, {
    message: "Password confirmation does not match.",
    path: ["password_confirmation"],
  })
  .refine((v) => v.role !== "CORPORATE" || Boolean(v.remitter_id), {
    message: "remitter_id is required for CORPORATE role.",
    path: ["remitter_id"],
  })
  .transform((v) => ({
    name: v.name,
    email: v.email,
    role: USER_ROLE_MAP[v.role] as number,
    permission: USER_PERMISSION_MAP[v.permission] as number,
    password: v.password,
    mobile_country_code: v.mobile_country_code,
    mobile: v.mobile,
    remitter_id: v.remitter_id,
  }));
export type TeamMemberCreateInput = {
  name: string;
  email: string;
  role: number;
  permission: number;
  password: string;
  mobile_country_code?: string;
  mobile?: string;
  remitter_id?: string;
};

export const TeamMemberUpdateSchema = z
  .object({
    team_member_id: z.string().min(1).max(64),
    name: z.string().min(1).max(255),
    email: z.string().trim().toLowerCase().email().max(255),
    role,
    permission,
    mobile_country_code: z.string().regex(/^\d{1,7}$/).optional(),
    mobile: z.string().regex(/^\d{8,15}$/).optional(),
  })
  .strict()
  .transform((v) => ({
    team_member_id: v.team_member_id,
    name: v.name,
    email: v.email,
    role: USER_ROLE_MAP[v.role] as number,
    permission: USER_PERMISSION_MAP[v.permission] as number,
    mobile_country_code: v.mobile_country_code,
    mobile: v.mobile,
  }));
export type TeamMemberUpdateInput = {
  team_member_id: string;
  name: string;
  email: string;
  role: number;
  permission: number;
  mobile_country_code?: string;
  mobile?: string;
};

export const TeamMemberShowSchema = z
  .object({ team_member_id: z.string().min(1).max(64) })
  .strict();
export type TeamMemberShowInput = z.infer<typeof TeamMemberShowSchema>;

export const TeamMemberListSchema = z
  .object({
    status: z.enum(Object.keys(TEAM_MEMBER_STATUS_MAP) as [string, ...string[]]).optional(),
    role: role.optional(),
    permission: permission.optional(),
    search_key: z.string().max(128).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type TeamMemberListInput = z.infer<typeof TeamMemberListSchema>;
