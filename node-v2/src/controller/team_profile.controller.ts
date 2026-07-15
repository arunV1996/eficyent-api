import { Request, Response } from "express";
import {
    generateAndStoreCredentials,
    rotateRsaKeys,
} from "../helpers/credential.helper";
import { decryptEnvelope } from "../helpers/crypto.helper";
import { getBusinessModel } from "../helpers/merchant.helper";
import { revokeTeamToken } from "../helpers/team_token.helper";
import TeamMember from "../models/team_member.model";
import { teamMemberToJSON } from "../resources/team_member.resource";
import { comparePassword, hashPassword } from "../utils/common.utils";
import { TEAM_MEMBER_INACTIVE } from "../utils/constants";
import { getAppSettings as userGetAppSettings } from "./setting.controller";

/**
 * Mirror of TeamMembers\ProfileController + the /team/get_settings
 * shim (a thin wrapper around the user-side settings endpoint).
 */

/**
 * GET /api/team/profile
 */
export const profile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.teamMember) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const businessModel = await getBusinessModel(
            req.user?.merchantId ?? null,
        );
        return res.sendResponse(
            {
                user: teamMemberToJSON(
                    req.teamMember,
                    req.user,
                    undefined,
                    businessModel,
                ),
            },
            "",
            200,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/team/get-credentials — generate on first use, otherwise
 * rotate the RSA pair; unreadable legacy ciphertexts self-heal with a
 * full regeneration (mirror of the legacy getCredentials).
 */
export const getCredentials = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.teamMember) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (req.teamMember.status === TEAM_MEMBER_INACTIVE) {
            return res.sendError("Team member is inactive.", 160, 400);
        }

        let teamMember = req.teamMember;
        if (
            !teamMember.apiKey ||
            !teamMember.saltKey ||
            !teamMember.privateKey
        ) {
            teamMember = (await generateAndStoreCredentials(
                teamMember.id,
                "teamMember",
            )) as TeamMember;
        } else {
            teamMember = (await rotateRsaKeys(
                teamMember.id,
                "teamMember",
            )) as TeamMember;
        }

        let privateKey: string;
        let saltKey: string | null = null;
        try {
            privateKey = await decryptEnvelope(teamMember.privateKey!);
            saltKey = teamMember.saltKey
                ? await decryptEnvelope(teamMember.saltKey)
                : null;
        } catch {
            // Legacy-cipher rows self-heal with a full regeneration.
            teamMember = (await generateAndStoreCredentials(
                teamMember.id,
                "teamMember",
            )) as TeamMember;
            privateKey = await decryptEnvelope(teamMember.privateKey!);
            saltKey = teamMember.saltKey
                ? await decryptEnvelope(teamMember.saltKey)
                : null;
        }

        return res.sendResponse(
            {
                user: {
                    unique_id: teamMember.uniqueId,
                    api_key: teamMember.apiKey,
                    salt_key: saltKey,
                    private_key: privateKey,
                },
            },
            "",
            200,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/team/get_settings — same payload as the user-side endpoint.
 */
export const getAppSettings = async (
    req: Request,
    res: Response,
): Promise<void> => {
    return userGetAppSettings(req, res);
};

/**
 * POST /api/team/change-password
 */
export const changePassword = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.teamMember || !req.tokenId) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const oldOk = await comparePassword(
            String(req.body.old_password),
            req.teamMember.password,
        );
        if (!oldOk) {
            return res.sendError(res.__("125"), 125, 400);
        }
        const sameAsOld = await comparePassword(
            String(req.body.password),
            req.teamMember.password,
        );
        if (sameAsOld) {
            return res.sendError(res.__("126"), 126, 400);
        }

        await req.teamMember.update({
            password: await hashPassword(String(req.body.password)),
            lastPasswordReset: new Date(),
        });

        await revokeTeamToken(req.tokenId, req.teamMember.id);
        return res.sendResponse([], "Password changed successfully.", 200);
    } catch (error) {
        return res.handleError(error);
    }
};
