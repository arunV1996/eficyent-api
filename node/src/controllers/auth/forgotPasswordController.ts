import { Request, Response } from "express";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import { userRepository } from "../../repositories/userRepository";
import { passwordService } from "../../services/auth/passwordService";
import { prisma } from "../../db/prisma";
import { generateEmailCode } from "../../helpers/uniqueId";
import { UserAuthEmailService } from "../../services/email/userAuthEmailService";
import { getRedis } from "../../config/redis";
import { randomTokenBase64Url } from "../../helpers/crypto";
import { env } from "../../config/env";
import {
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyCodeInput,
} from "../../validators/auth/authValidators";

/**
 * Mirror of Api\\ForgotPasswordController. Behavior preserved:
 *   - send_reset_link: writes email_code on the user, mails the OTP
 *   - verify_code: 10-attempts-then-30-min lock per email (Redis)
 *   - reset_password: PasswordReset row + token expiry from settings
 */

const RESET_LINK_TTL_MIN = 10;
const PASSWORD_RESET_EXPIRY_MIN_DEFAULT = 60;

export const forgotPasswordController = {
  async sendResetLink(req: Request, res: Response): Promise<Response> {
    const body = req.body as ForgotPasswordInput;
    const user = await userRepository.findByEmail(body.email);
    if (!user) throw new ApiException(102);

    await prisma().user.update({
      where: { id: user.id },
      data: {
        emailCode: generateEmailCode(),
        emailCodeExpiry: new Date(
          Date.now() + RESET_LINK_TTL_MIN * 60_000,
        ).toISOString(),
      },
    });

    await UserAuthEmailService.forgotPassword(user);

    return sendResponse(res, apiSuccess(109), 109, { email: user.email });
  },

  async verifyCode(req: Request, res: Response): Promise<Response> {
    const body = req.body as VerifyCodeInput;
    const user = await userRepository.findByEmail(body.email);
    if (!user) throw new ApiException(102);

    const r = await getRedis();
    const blockedKey = `email_blocked:${user.email}`;
    const attemptsKey = `email_attempts:${user.email}`;

    if (await r.exists(blockedKey)) {
      throw new ApiException(134);
    }

    if (!env().APP_IS_SANDBOX) {
      if (user.emailCode !== body.verification_code) {
        const attempts = await r.incr(attemptsKey);
        if (attempts === 1) await r.expire(attemptsKey, 10 * 60);
        if (attempts >= 10) {
          await r.set(blockedKey, "1", "EX", 30 * 60);
        }
        throw new ApiException(142);
      }
    }
    await r.del(attemptsKey);

    const token = randomTokenBase64Url(32);
    await prisma().$transaction([
      prisma().passwordReset.deleteMany({ where: { email: user.email } }),
      prisma().passwordReset.create({
        data: { email: user.email, token },
      }),
      prisma().user.update({
        where: { id: user.id },
        data: { emailCode: null, emailCodeExpiry: null },
      }),
    ]);

    return sendResponse(res, apiSuccess(110), 110, {
      reset_token: token,
      email: user.email,
    });
  },

  async resetPassword(req: Request, res: Response): Promise<Response> {
    const body = req.body as ResetPasswordInput;
    const reset = await prisma().passwordReset.findUnique({
      where: { token: body.reset_token },
    });
    if (!reset) throw new ApiException(128);

    const expiryMs =
      PASSWORD_RESET_EXPIRY_MIN_DEFAULT * 60_000;
    if (reset.createdAt.getTime() + expiryMs < Date.now()) {
      throw new ApiException(141);
    }

    const user = await userRepository.findByEmail(reset.email);
    if (!user) throw new ApiException(102);

    const newHash = await passwordService.hash(body.password);
    await prisma().$transaction([
      prisma().user.update({
        where: { id: user.id },
        data: { password: newHash },
      }),
      prisma().passwordReset.deleteMany({ where: { token: body.reset_token } }),
    ]);

    return sendResponse(res, apiSuccess(111), 111, []);
  },
};
