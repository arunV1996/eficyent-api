import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import { passwordService } from "../../services/auth/passwordService";
import { teamTokenService } from "../../services/auth/teamTokenService";
import { generateEmailCode } from "../../helpers/uniqueId";
import { generateEmailCodeExpiry } from "../../helpers/lookups";
import { getRedis } from "../../config/redis";
import { randomTokenBase64Url } from "../../helpers/crypto";
import { env } from "../../config/env";
import {
  ForceResetPasswordInput,
  TeamForgotPasswordInput,
  TeamResetPasswordInput,
  TeamVerifyCodeInput,
} from "../../validators/team/teamAuthValidators";
// @ts-ignore - Catch-all auto-fix for: 'logger' is declared but its v...
import { logger } from "../../helpers/logger";

/**
 * Mirror of TeamMembers\\ForgotPasswordController. The flow has four
 * endpoints:
 *
 *   /team/force-reset-password  - first-login set-password (no token yet)
 *   /team/forgot-password/send-reset-link
 *   /team/forgot-password/verify-code  (10-min lockout after 5 failed)
 *   /team/forgot-password/reset-password
 *
 * Reset rows live in the same `password_resets` table the user-side flow
 * uses. The team-member email is unique across both User and TeamMember
 * tables in production, so collision is not a concern; if you ever
 * collapse the constraint, scope by a tokenable_type column.
 */

const PASSWORD_RESET_EXPIRY_MIN = 60;

export const teamForgotPasswordController = {
  async forceResetPassword(req: Request, res: Response): Promise<Response> {
    const body = req.body as ForceResetPasswordInput;
    const member = await prisma().teamMember.findUnique({
      where: { email: body.email },
    });
    if (!member) throw new ApiException(102);
    if (member.lastPasswordReset) throw new ApiException(161);

    const sameAsExisting = await passwordService.verify(
      member.password,
      body.password,
    );
    if (sameAsExisting) throw new ApiException(126);

    const updated = await prisma().teamMember.update({
      where: { id: member.id },
      data: {
        password: await passwordService.hash(body.password),
        lastPasswordReset: new Date(),
      },
    });
    const issued = await teamTokenService.issue(updated, null);
    return sendResponse(res, apiSuccess(111), 111, {
      access_token: issued.plaintext,
    });
  },

  async sendResetLink(req: Request, res: Response): Promise<Response> {
    const body = req.body as TeamForgotPasswordInput;
    const member = await prisma().teamMember.findUnique({
      where: { email: body.email },
    });
    if (!member) throw new ApiException(102);
    const updated = await prisma().teamMember.update({
      where: { id: member.id },
      data: {
        emailCode: generateEmailCode(),
        emailCodeExpiry: generateEmailCodeExpiry(10),
      },
    });
    const { TeamAuthEmailService } = await import(
      "../../services/email/teamAuthEmailService"
    );
    await TeamAuthEmailService.forgotPassword(updated);
    return sendResponse(res, apiSuccess(109), 109, { email: member.email });
  },

  async verifyCode(req: Request, res: Response): Promise<Response> {
    const body = req.body as TeamVerifyCodeInput;
    const member = await prisma().teamMember.findUnique({
      where: { email: body.email },
    });
    if (!member) throw new ApiException(102);

    const r = await getRedis();
    const blockedKey = `team_email_blocked:${member.email}`;
    const attemptsKey = `team_email_attempts:${member.email}`;
    if (await r.exists(blockedKey)) throw new ApiException(134);

    if (!env().APP_IS_SANDBOX) {
      if (member.emailCode !== body.verification_code) {
        const attempts = await r.incr(attemptsKey);
        if (attempts === 1) await r.expire(attemptsKey, 10 * 60);
        if (attempts >= 5) await r.set(blockedKey, "1", "EX", 30 * 60);
        throw new ApiException(142);
      }
    }
    await r.del(attemptsKey);

    const token = randomTokenBase64Url(32);
    await prisma().$transaction([
      prisma().password_reset_tokens.deleteMany({ where: { email: member.email } }),
      prisma().password_reset_tokens.create({
        data: { email: member.email, token, created_at: new Date() },
      }),
      prisma().teamMember.update({
        where: { id: member.id },
        data: { emailCode: null, emailCodeExpiry: null },
      }),
    ]);
    return sendResponse(res, apiSuccess(110), 110, {
      reset_token: token,
      email: member.email,
    });
  },

  async resetPassword(req: Request, res: Response): Promise<Response> {
    const body = req.body as TeamResetPasswordInput;
    const reset = await prisma().password_reset_tokens.findFirst({
      where: { token: body.reset_token },
    });
    if (!reset) throw new ApiException(128);
    if (
      !reset.created_at ||
      reset.created_at.getTime() + PASSWORD_RESET_EXPIRY_MIN * 60_000 <
      Date.now()
    ) {
      throw new ApiException(141);
    }
    const member = await prisma().teamMember.findUnique({
      where: { email: reset.email },
    });
    if (!member) throw new ApiException(102);

    await prisma().$transaction([
      prisma().teamMember.update({
        where: { id: member.id },
        data: {
          password: await passwordService.hash(body.password),
          lastPasswordReset: new Date(),
        },
      }),
      prisma().password_reset_tokens.deleteMany({ where: { token: body.reset_token } }),
    ]);
    return sendResponse(res, apiSuccess(111), 111, []);
  },
};
