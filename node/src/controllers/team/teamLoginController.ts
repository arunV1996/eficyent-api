import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  TEAM_MEMBER_INACTIVE,
  TEAM_MEMBER_ROLE_CORPORATE,
} from "../../helpers/constants";
import { passwordService } from "../../services/auth/passwordService";
import { teamTokenService } from "../../services/auth/teamTokenService";
import { teamMemberResource } from "../../services/auth/teamMemberResource";
import { TeamLoginInput } from "../../validators/team/teamAuthValidators";

/**
 * Mirror of TeamMembers\\LoginController.
 *
 * Two login paths:
 *   /team/login           - role != CORPORATE
 *   /corporate/login      - role == CORPORATE
 *
 * Force-password-reset gate: if last_password_reset is null we return
 * password_reset=true and skip token issuance; the client follows up with
 * /team/force-reset-password to set a real password and receive a token.
 */

async function loginCommon(
  body: TeamLoginInput,
  expectedCorporate: boolean,
  res: Response,
): Promise<Response> {
  const member = await prisma().teamMember.findUnique({
    where: { email: body.email },
  });
  if (!member) throw new ApiException(102);

  // Constant-time-ish password verify (always run, even on missing member,
  // see Phase 1 notes for the rationale).
  const valid = await passwordService.verify(member.password, body.password);
  if (!valid) throw new ApiException(125);
  if (member.status === TEAM_MEMBER_INACTIVE) throw new ApiException(160);

  const isCorporate = member.role === TEAM_MEMBER_ROLE_CORPORATE;
  if (expectedCorporate !== isCorporate) {
    throw new ApiException(185);
  }

  const data: Record<string, unknown> = {
    user: teamMemberResource(member),
    password_reset: false,
  };

  if (!member.lastPasswordReset) {
    // Force reset before token issuance.
    data.password_reset = true;
    return sendResponse(res, apiSuccess(104), 104, data);
  }

  // One-active-token-per-member - mirror of $user->tokens()->delete().
  await teamTokenService.revokeAll(member.id);
  const issued = await teamTokenService.issue(member, null);
  data.access_token = issued.plaintext;
  return sendResponse(res, apiSuccess(104), 104, data);
}

export const teamLoginController = {
  async login(req: Request, res: Response): Promise<Response> {
    return loginCommon(req.body as TeamLoginInput, false, res);
  },
  async corporateLogin(req: Request, res: Response): Promise<Response> {
    return loginCommon(req.body as TeamLoginInput, true, res);
  },
  async logout(req: Request, res: Response): Promise<Response> {
    if (!req.teamMember || !req.tokenId) throw new ApiException(102);
    await teamTokenService.revoke(req.tokenId, req.teamMember.id);
    return sendResponse(res, apiSuccess(105), 105, []);
  },
};
