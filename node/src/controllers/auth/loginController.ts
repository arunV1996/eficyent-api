import { Request, Response } from "express";
import { User } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import { userRepository } from "../../repositories/userRepository";
import { tokenService } from "../../services/auth/tokenService";
import { passwordService } from "../../services/auth/passwordService";
import { totpService } from "../../services/auth/totpService";
import { prisma } from "../../db/prisma";
import { LoginInput, TfaLoginInput } from "../../validators/auth/authValidators";
import { METHOD_LOGIN } from "../../helpers/constants";

/**
 * Mirror of App\Http\Controllers\Api\LoginController.
 *
 * Response envelope and codes match the Laravel implementation 1:1.
 */

function shapeUser(user: User, method: string): Record<string, unknown> {
  // Mirrors UserResource(user, METHOD_LOGIN). Keep field set/order stable -
  // changing it is an API contract break.
  return {
    id: user.id.toString(),
    unique_id: user.uniqueId,
    title: user.title,
    first_name: user.firstName,
    middle_name: user.middleName,
    last_name: user.lastName,
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    user_type: user.userType,
    user_role: user.userRole,
    onboarding_step: user.onboardingStep,
    id_verification: user.idVerification,
    is_tfa_enabled: user.isTfaEnabled,
    timezone: user.timezone,
    email_verified: !!user.emailVerifiedAt,
    method,
  };
}

export const loginController = {
  async login(req: Request, res: Response): Promise<Response> {
    const body = req.body as LoginInput;
    const user = await userRepository.findByEmail(body.email);

    // Constant-time-ish: always run a verify even when user is missing, so
    // attackers can't probe accounts via response timing.
    const dummyHash =
      "$argon2id$v=19$m=19456,t=2,p=1$bm9wZWNvbnN0YW50dGltZXg$bm90X3JlYWxfaGFzaA";
    const validPair = user
      ? await passwordService.verifyAndUpgrade(user.password, body.password)
      : ((await passwordService.verify(dummyHash, body.password)) as boolean) && false;

    if (!user || !validPair || !validPair.valid) {
      throw new ApiException(125, undefined, 401);
    }

    if (validPair.rehash) {
      await prisma().user.update({
        where: { id: user.id },
        data: { password: validPair.rehash },
      });
    }

    // Persist device fields exactly as Laravel did.
    await prisma().user.update({
      where: { id: user.id },
      data: {
        deviceId: body.device_id ?? null,
        deviceType: body.device_type ?? null,
      },
    });

    // X-Merchant-Id check (mirror of LoginController.merchantHeader).
    const merchantHeader = req.header("x-merchant-id");
    if (user.merchantId && merchantHeader) {
      const merchant = await prisma().merchant.findFirst({
        where: { uniqueId: merchantHeader },
      });
      if (!merchant || merchant.uniqueId !== merchantHeader) {
        throw new ApiException(151, undefined, 401);
      }
      // 1 = MERCHANT_TYPE_PAYOUT, 4 = MERCHANT_TYPE_PAYINCOLLECTION
      if (merchant.type === 1 || merchant.type === 4) {
        const ttl = 30 * 60; // 30 minutes
        const issued = await tokenService.issue(user, ["authentication"], ttl);
        return sendResponse(
          res,
          "",
          104,
          {
            access_token: issued.plaintext,
            expires_at: issued.expiresAt?.toISOString(),
            expires_in: ttl,
          },
        );
      }
    }

    if (user.isTfaEnabled) {
      // Don't issue a token; client must follow up with /tfa-login.
      return sendResponse(res, apiSuccess(104), 104, { user: shapeUser(user, METHOD_LOGIN) });
    }

    const issued = await tokenService.issue(user, ["authentication"], null);
    return sendResponse(res, apiSuccess(104), 104, {
      user: shapeUser(user, METHOD_LOGIN),
      access_token: issued.plaintext,
    });
  },

  async tfaLogin(req: Request, res: Response): Promise<Response> {
    const body = req.body as TfaLoginInput;
    const user = await userRepository.findByEmail(body.email);
    if (!user) throw new ApiException(102);
    if (!user.isTfaEnabled) throw new ApiException(140);

    const ok = await totpService.verify(user.tfaSecret ?? "", body.verification_code);
    if (!ok) throw new ApiException(139);

    const issued = await tokenService.issue(user, ["authentication"], null);
    return sendResponse(res, apiSuccess(104), 104, {
      user: shapeUser(user, METHOD_LOGIN),
      access_token: issued.plaintext,
    });
  },

  async logout(req: Request, res: Response): Promise<Response> {
    if (!req.user || !req.tokenId) throw new ApiException(102);
    await tokenService.revoke(req.tokenId, req.user.id);
    await prisma().user.update({
      where: { id: req.user.id },
      data: { privateKey: null, publicKey: null },
    });
    return sendResponse(res, apiSuccess(105), 105, []);
  },
};
