import { Request, Response } from "express";
import { decryptEnvelope } from "../../config/kms";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { TEAM_MEMBER_INACTIVE } from "../../helpers/constants";
import { passwordService } from "../../services/auth/passwordService";
import { teamTokenService } from "../../services/auth/teamTokenService";
import { teamMemberResource } from "../../services/auth/teamMemberResource";
import { credentialService } from "../../services/auth/credentialService";
import { TeamChangePasswordInput } from "../../validators/team/teamAuthValidators";
import { settingsController } from "../settings/settingsController";

/**
 * Mirror of TeamMembers\\ProfileController + the /team/get_settings shim
 * (which is a thin wrapper around the user-side Settings::get_app_settings).
 */

export const teamProfileController = {
  async profile(req: Request, res: Response): Promise<Response> {
    if (!req.teamMember) throw new ApiException(102);
    return sendResponse(res, "", 200, {
      user: teamMemberResource(req.teamMember),
    });
  },

  async getCredentials(req: Request, res: Response): Promise<Response> {
    if (!req.teamMember) throw new ApiException(102);
    if (req.teamMember.status === TEAM_MEMBER_INACTIVE) throw new ApiException(160);

    let teamMember = req.teamMember;

    // Generate if missing
    if (!teamMember.apiKey || !teamMember.saltKey || !teamMember.privateKey) {
      teamMember = await credentialService.generateAndStore(teamMember.id, "teamMember");
    }

    const privateKey = await decryptEnvelope(teamMember.privateKey as string);

    return sendResponse(res, "", 200, {
      user: {
        unique_id: teamMember.uniqueId,
        api_key: teamMember.apiKey,
        salt_key: teamMember.saltKey ? await decryptEnvelope(teamMember.saltKey) : null,
        private_key: privateKey,
      },
    });
  },

  async getAppSettings(req: Request, res: Response): Promise<Response> {
    return settingsController.getAppSettings(req, res);
  },

  async changePassword(req: Request, res: Response): Promise<Response> {
    if (!req.teamMember || !req.tokenId) throw new ApiException(102);
    const body = req.body as TeamChangePasswordInput;
    const oldOk = await passwordService.verify(req.teamMember.password, body.old_password);
    if (!oldOk) throw new ApiException(125);
    const sameAsOld = await passwordService.verify(req.teamMember.password, body.password);
    if (sameAsOld) throw new ApiException(126);

    await prisma().teamMember.update({
      where: { id: req.teamMember.id },
      data: {
        password: await passwordService.hash(body.password),
        lastPasswordReset: new Date(),
      },
    });

    await teamTokenService.revoke(req.tokenId, req.teamMember.id);
    return sendResponse(res, "Password changed successfully.", 200, []);
  },
};
