import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException, ValidationException } from "../../helpers/errors";
import {
  TAKE_COUNT,
  TEAM_MEMBER_ACTIVE,
  TEAM_MEMBER_DISABLED,
  TEAM_MEMBER_ROLE_CORPORATE,
  TEAM_MEMBER_STATUS_MAP,
  USER_PERMISSION_MAP,
  USER_ROLE_MAP,
} from "../../helpers/constants";
import { uniqueId } from "../../helpers/uniqueId";
import { passwordService } from "../../services/auth/passwordService";
import { teamMemberResource } from "../../services/auth/teamMemberResource";
import {
  TeamMemberCreateInput,
  TeamMemberListInput,
  TeamMemberShowInput,
  TeamMemberUpdateInput,
} from "../../validators/team/teamMemberCrudValidators";

/**
 * Mirror of TeamMembers\\TeamMemberController + TeamMemberRepository.
 *
 * Scoped by user_id of the parent business user (req.user.id), which is
 * always the team-caller's auth('team').user. The role/permission
 * coercion is done in the validators; here we just persist.
 */

export const teamMemberCrudController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as TeamMemberListInput;

    const status =
      q.status && q.status in TEAM_MEMBER_STATUS_MAP
        ? TEAM_MEMBER_STATUS_MAP[q.status]
        : null;
    const role = q.role ? USER_ROLE_MAP[q.role] : null;
    const permission = q.permission ? USER_PERMISSION_MAP[q.permission] : null;

    const where: Prisma.TeamMemberWhereInput = {
      userId: req.user.id,
      deletedAt: null,
      ...(status !== null ? { status } : {}),
      ...(role !== null ? { role } : { role: { not: TEAM_MEMBER_ROLE_CORPORATE } }),
      ...(permission !== null ? { permission } : {}),
      ...(q.search_key
        ? {
            OR: [
              { name: { contains: q.search_key } },
              { email: { contains: q.search_key } },
              { mobile: { contains: q.search_key } },
            ],
          }
        : {}),
    };
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().teamMember.count({ where }),
      prisma().teamMember.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return res.status(200).json({
      success: true,
      message: "",
      code: "",
      data: {
        total,
        team_members: rows.map((row) => teamMemberResource(row, req.user)),
      },
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as TeamMemberCreateInput;

    let senderId: bigint | null = null;
    if (body.role === TEAM_MEMBER_ROLE_CORPORATE && body.remitter_id) {
      const sender = await prisma().sender.findFirst({
        where: { uniqueId: body.remitter_id, userId: req.user.id, deletedAt: null },
      });
      if (!sender) throw new ApiException(132);
      senderId = sender.id;
    }

    const existing = await prisma().teamMember.findFirst({
      where: { email: body.email },
    });
    if (existing) {
      throw new ValidationException({
        email: ["The email has already been taken."],
      });
    }

    const member = await prisma().teamMember.create({
      data: {
        uniqueId: uniqueId(24),
        userId: req.user.id,
        senderId,
        name: body.name,
        email: body.email,
        mobileCountryCode: body.mobile_country_code ?? null,
        mobile: body.mobile ?? null,
        password: await passwordService.hash(body.password),
        role: body.role,
        permission: body.permission,
        status: TEAM_MEMBER_ACTIVE,
      },
    });
    return res.status(200).json({
      success: true,
      message: "Team member created successfully.",
      code: "",
      data: {
        team_member: teamMemberResource(member, req.user),
      },
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as TeamMemberShowInput;
    const member = await prisma().teamMember.findFirst({
      where: { userId: req.user.id, uniqueId: q.team_member_id, deletedAt: null },
    });
    if (!member) throw new ApiException(159);
    return res.status(200).json({
      success: true,
      message: "Team member fetched successfully.",
      code: "",
      data: {
        team_member: teamMemberResource(member, req.user),
      },
    });
  },

  async update(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as TeamMemberUpdateInput;
    const member = await prisma().teamMember.findFirst({
      where: { userId: req.user.id, uniqueId: body.team_member_id, deletedAt: null },
    });
    if (!member) throw new ApiException(159);

    const existing = await prisma().teamMember.findFirst({
      where: {
        email: body.email,
        id: { not: member.id },
      },
    });
    if (existing) {
      throw new ValidationException({
        email: ["The email has already been taken."],
      });
    }

    const updated = await prisma().teamMember.update({
      where: { id: member.id },
      data: {
        name: body.name,
        email: body.email,
        mobileCountryCode: body.mobile_country_code ?? null,
        mobile: body.mobile ?? null,
        role: body.role,
        permission: body.permission,
        status: body.status,
      },
    });
    return res.status(200).json({
      success: true,
      message: "Team member updated successfully.",
      code: "",
      data: {
        team_member: teamMemberResource(updated, req.user),
      },
    });
  },

  async destroy(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as TeamMemberShowInput;
    const member = await prisma().teamMember.findFirst({
      where: { userId: req.user.id, uniqueId: q.team_member_id, deletedAt: null },
    });
    if (!member) throw new ApiException(159);
    await prisma().teamMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date() },
    });
    return res.status(200).json({
      success: true,
      message: "Team member deleted successfully.",
      code: "",
      data: {},
    });
  },

  async updateStatus(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as TeamMemberShowInput;
    const member = await prisma().teamMember.findFirst({
      where: { userId: req.user.id, uniqueId: body.team_member_id, deletedAt: null },
    });
    if (!member) throw new ApiException(159);
    const newStatus =
      member.status === TEAM_MEMBER_DISABLED ? TEAM_MEMBER_ACTIVE : TEAM_MEMBER_DISABLED;
    await prisma().teamMember.update({
      where: { id: member.id },
      data: { status: newStatus },
    });
    return res.status(200).json({
      success: true,
      message: "Team member status updated successfully.",
      code: "",
      data: {},
    });
  },
};
