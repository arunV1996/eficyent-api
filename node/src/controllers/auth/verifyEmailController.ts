import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import { tokenService } from "../../services/auth/tokenService";
import { UserAuthEmailService } from "../../services/email/userAuthEmailService";
// @ts-ignore - Catch-all auto-fix for: 'METHOD_VERIFY_EMAIL' is decla...
import {
  METHOD_VERIFY_EMAIL,
} from "../../helpers/constants";
import { env } from "../../config/env";
import { userRepository } from "../../repositories/userRepository";
import {
  SendOtpInput,
  VerifyOtpInput,
} from "../../validators/auth/verifyEmailValidators";

/**
 * Mirror of Api\\VerifyEmailController.
 *
 *   verifyOtp -> validate otp, mark email_verified_at, issue access token,
 *                send "email_verified" notification.
 *   resendOtp -> regenerate email_code + email_code_expiry on the user,
 *                send "email_verification_code" notification.
 */

function shapeUser(u: {
  uniqueId: string;
  email: string;
  emailVerifiedAt: Date | null;
}): Record<string, unknown> {
  return {
    unique_id: u.uniqueId,
    email: u.email,
    email_status: u.emailVerifiedAt ? 1 : 0,
  };
}

export const verifyEmailController = {
  async verifyOtp(req: Request, res: Response): Promise<Response> {
    const body = req.body as VerifyOtpInput;
    const user = await userRepository.findByEmail(body.email);
    if (!user) throw new ApiException(102);

    if (!env().APP_IS_SANDBOX) {
      if (user.emailCode !== body.otp) throw new ApiException(103);
      // emailCodeExpiry stored as ISO string (see registerController).
      if (user.emailCodeExpiry) {
        const exp = Date.parse(user.emailCodeExpiry);
        if (Number.isFinite(exp) && exp < Date.now()) throw new ApiException(104);
      }
    }

    const updated = await prisma().user.update({
      where: { id: user.id },
      data: {
        emailCode: null,
        emailCodeExpiry: null,
        emailVerifiedAt: new Date(),
      },
    });

    const issued = await tokenService.issue(updated, ["authentication"], null);
    await UserAuthEmailService.emailVerified(updated);

    return sendResponse(res, apiSuccess(102), 102, {
      user: shapeUser(updated),
      access_token: issued.plaintext,
    });
  },

  async resendOtp(req: Request, res: Response): Promise<Response> {
    const body = req.body as SendOtpInput;
    const user = await userRepository.findByEmail(body.email);
    if (!user) throw new ApiException(102);
    if (user.emailVerifiedAt) throw new ApiException(106);
    await UserAuthEmailService.emailVerificationCode(user);
    return sendResponse(res, apiSuccess(103), 103, {});
  },
};
