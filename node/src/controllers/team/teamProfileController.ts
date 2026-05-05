import { Request, Response } from "express";
import { generateKeyPairSync } from "crypto";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { TEAM_MEMBER_INACTIVE } from "../../helpers/constants";
import { passwordService } from "../../services/auth/passwordService";
import { teamTokenService } from "../../services/auth/teamTokenService";
import { encryptEnvelope, decryptEnvelope } from "../../config/kms";
import { teamMemberResource } from "../../services/auth/teamMemberResource";
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

    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    const updated = await prisma().teamMember.update({
      where: { id: req.teamMember.id },
      data: {
        publicKey: await encryptEnvelope(publicKey),
        privateKey: await encryptEnvelope(privateKey),
      },
    });

    return sendResponse(res, "", 200, {
      user: {
        unique_id: updated.uniqueId,
        api_key: updated.apiKey,
        salt_key: updated.saltKey ? await decryptEnvelope(updated.saltKey) : null,
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
