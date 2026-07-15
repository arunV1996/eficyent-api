import { Request, Response } from "express";
import { Op } from "sequelize";
import Sender from "../models/sender.model";
import TeamMember from "../models/team_member.model";
import { teamMemberToJSON } from "../resources/team_member.resource";
import { generateUniqueId, hashPassword } from "../utils/common.utils";
import {
    TAKE_COUNT,
    TEAM_MEMBER_ACTIVE,
    TEAM_MEMBER_DISABLED,
    TEAM_MEMBER_ROLE_CORPORATE,
    TEAM_MEMBER_STATUS_MAP,
    USER_PERMISSION_MAP,
    USER_ROLE_MAP,
} from "../utils/constants";

/**
 * Mirror of TeamMembers\TeamMemberController + TeamMemberRepository.
 * Scoped by the parent business user (req.user.id — for team callers
 * the authTeam middleware sets req.user to the member's parent).
 * Role/permission tokens are mapped here (the legacy zod transform).
 */

/**
 * GET /team-members/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;

        const status =
            query.status && query.status in TEAM_MEMBER_STATUS_MAP
                ? TEAM_MEMBER_STATUS_MAP[query.status]
                : null;
        const role = query.role ? USER_ROLE_MAP[query.role] : null;
        const permission = query.permission
            ? USER_PERMISSION_MAP[query.permission]
            : null;

        const where: Record<string | symbol, unknown> = {
            userId: req.user.id,
        };
        if (status !== null) {
            where.status = status;
        }
        if (role !== null && role !== undefined) {
            where.role = role;
        } else {
            // Corporate members live in their own flow; the default
            // listing excludes them (mirror of the legacy filter).
            where.role = { [Op.ne]: TEAM_MEMBER_ROLE_CORPORATE };
        }
        if (permission !== null && permission !== undefined) {
            where.permission = permission;
        }
        if (query.search_key) {
            const searchTerm = `%${query.search_key}%`;
            where[Op.or] = [
                { name: { [Op.like]: searchTerm } },
                { email: { [Op.like]: searchTerm } },
                { mobile: { [Op.like]: searchTerm } },
            ];
        }

        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;
        const [total, rows] = await Promise.all([
            TeamMember.count({ where }),
            TeamMember.findAll({
                where,
                order: [["created_at", "DESC"]],
                offset: skip,
                limit: take,
            }),
        ]);

        return res.sendEmptyEnvelope(
            {
                total,
                team_members: rows.map((row) =>
                    teamMemberToJSON(row, req.user),
                ),
            },
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /team-members/create
 */
export const store = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const body = req.body as Record<string, string | undefined>;
        const role = USER_ROLE_MAP[String(body.role)];
        const permission = USER_PERMISSION_MAP[String(body.permission)];
        const email = String(body.email).toLowerCase().trim();

        let senderId: number | null = null;
        let senderUniqueId: string | null = null;
        if (role === TEAM_MEMBER_ROLE_CORPORATE && body.remitter_id) {
            const sender = await Sender.findOne({
                where: { uniqueId: body.remitter_id, userId: req.user.id },
            });
            if (!sender) {
                return res.sendError("Sender not found.", 132, 400);
            }
            senderId = sender.id;
            senderUniqueId = sender.uniqueId;
        }

        const existing = await TeamMember.findOne({
            where: { email },
            paranoid: false,
        });
        if (existing) {
            return res.sendError(
                "The email has already been taken.",
                422,
                422,
            );
        }

        const member = await TeamMember.create({
            uniqueId: generateUniqueId(24),
            userId: req.user.id,
            senderId,
            name: String(body.name),
            email,
            mobileCountryCode: body.mobile_country_code ?? null,
            mobile: body.mobile ?? null,
            password: await hashPassword(String(body.password)),
            role,
            permission,
            status: TEAM_MEMBER_ACTIVE,
        });
        return res.sendEmptyEnvelope(
            {
                team_member: teamMemberToJSON(
                    member,
                    req.user,
                    senderUniqueId,
                ),
            },
            "Team member created successfully.",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

const resolveSenderUniqueId = async (
    member: TeamMember,
): Promise<string | null> => {
    if (!member.senderId) {
        return null;
    }
    const sender = await Sender.findOne({
        where: { id: member.senderId },
        attributes: ["uniqueId"],
        paranoid: false,
    });
    return sender?.uniqueId ?? null;
};

/**
 * GET /team-members/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const member = await TeamMember.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.query.team_member_id),
            },
        });
        if (!member) {
            return res.sendError("Team member not found.", 159, 400);
        }
        const senderUniqueId = await resolveSenderUniqueId(member);
        return res.sendEmptyEnvelope(
            {
                team_member: teamMemberToJSON(
                    member,
                    req.user,
                    senderUniqueId,
                ),
            },
            "Team member fetched successfully.",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /team-members/update
 */
export const update = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const body = req.body as Record<string, string | undefined>;
        const member = await TeamMember.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(body.team_member_id),
            },
        });
        if (!member) {
            return res.sendError("Team member not found.", 159, 400);
        }

        const email = String(body.email).toLowerCase().trim();
        const existing = await TeamMember.findOne({
            where: { email, id: { [Op.ne]: member.id } },
            paranoid: false,
        });
        if (existing) {
            return res.sendError(
                "The email has already been taken.",
                422,
                422,
            );
        }

        const status =
            body.status !== undefined
                ? TEAM_MEMBER_STATUS_MAP[String(body.status)]
                : undefined;
        const updated = await member.update({
            name: String(body.name),
            email,
            mobileCountryCode: body.mobile_country_code ?? null,
            mobile: body.mobile ?? null,
            role: USER_ROLE_MAP[String(body.role)],
            permission: USER_PERMISSION_MAP[String(body.permission)],
            ...(status !== undefined ? { status } : {}),
        });

        const senderUniqueId = await resolveSenderUniqueId(updated);
        return res.sendEmptyEnvelope(
            {
                team_member: teamMemberToJSON(
                    updated,
                    req.user,
                    senderUniqueId,
                ),
            },
            "Team member updated successfully.",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * DELETE /team-members/delete
 */
export const destroy = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const member = await TeamMember.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.query.team_member_id),
            },
        });
        if (!member) {
            return res.sendError("Team member not found.", 159, 400);
        }
        await member.destroy();
        return res.sendEmptyEnvelope({}, "Team member deleted successfully.");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /team-members/update-status — toggles DISABLED <-> ACTIVE.
 */
export const updateStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const member = await TeamMember.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.body.team_member_id),
            },
        });
        if (!member) {
            return res.sendError("Team member not found.", 159, 400);
        }
        const newStatus =
            member.status === TEAM_MEMBER_DISABLED
                ? TEAM_MEMBER_ACTIVE
                : TEAM_MEMBER_DISABLED;
        await member.update({ status: newStatus });
        return res.sendEmptyEnvelope(
            {},
            "Team member status updated successfully.",
        );
    } catch (error) {
        return res.handleError(error);
    }
};
