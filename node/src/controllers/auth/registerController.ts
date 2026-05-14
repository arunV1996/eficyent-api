import { Request, Response } from "express";
import { ApiException, ValidationException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import { passwordService } from "../../services/auth/passwordService";
import { prisma } from "../../db/prisma";
import { uniqueId } from "../../helpers/uniqueId";
import { generateEmailCode } from "../../helpers/uniqueId";
import { UserAuthEmailService } from "../../services/email/userAuthEmailService";
import { credentialService } from "../../services/auth/credentialService";
import {
  MERCHANT_TYPE_PAYINCOLLECTION,
  MERCHANT_TYPE_PAYOUTINTEGRATOR,
  MERCHANT_TYPE_WHITELABEL,
  SUPPORTED_USER_BUSINESS,
  SUPPORTED_USER_INDIVIDUAL,
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
  USER_TYPE_PENDING,
} from "../../helpers/constants";
import { RegisterInput } from "../../validators/auth/authValidators";

/**
 * Mirror of Api\\RegisterController.register.
 *
 * Logic preserved:
 *   - X-Merchant-Id header changes the email-verification flow:
 *       * absent  -> send OTP email
 *       * present + WHITELABEL -> send OTP email
 *       * present + PAYINCOLLECTION/PAYOUTINTEGRATOR -> auto-verify, but
 *         only if merchant supports the user_type
 *   - All work runs inside a transaction.
 */

async function isSupportedUserType(
  userType: number,
  merchantId: bigint,
  tx: any,
): Promise<boolean> {
  const setting = await tx.merchantSetting.findUnique({
    where: { merchantId_key: { merchantId, key: "supported_user_types" } },
  });
  if (!setting?.value) return true;
  if (setting.value === SUPPORTED_USER_BUSINESS && userType !== USER_TYPE_BUSINESS) {
    return false;
  }
  if (setting.value === SUPPORTED_USER_INDIVIDUAL && userType !== USER_TYPE_INDIVIDUAL) {
    return false;
  }
  return true;
}

export const registerController = {
  async register(req: Request, res: Response): Promise<Response> {
    const body = req.body as RegisterInput;
    const merchantHeader = req.header("x-merchant-id");

    const passwordHash = await passwordService.hash(body.password);
    const user = await prisma().$transaction(async (tx) => {
      // Uniqueness check (mirrors Laravel Unique validation rule)
      const existing = await tx.user.findFirst({
        where: {
          OR: [{ email: body.email }, { mobile: body.mobile ?? undefined }],
        },
      });

      if (existing) {
        const errors: Record<string, string[]> = {};
        if (existing.email === body.email) {
          errors.email = ["The email has already been taken."];
        }
        if (body.mobile && existing.mobile === body.mobile) {
          errors.mobile = ["The mobile has already been taken."];
        }
        if (Object.keys(errors).length > 0) {
          throw new ValidationException(errors);
        }
      }

      let sendEmail = !merchantHeader;
      let merchantRowId: bigint | null = null;

      if (merchantHeader) {
        const merchant = await tx.merchant.findFirst({
          where: { uniqueId: merchantHeader },
        });
        if (merchant) {
          merchantRowId = merchant.id;
          if (merchant.type === MERCHANT_TYPE_WHITELABEL) sendEmail = true;
          if (
            merchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
            merchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR
          ) {
            const supported = await isSupportedUserType(
              body.user_type ?? USER_TYPE_PENDING,
              merchant.id,
              tx,
            );
            if (!supported) {
              throw new ApiException(194);
            }
          }
        }
      }

      const created = await tx.user.create({
        data: {
          uniqueId: uniqueId(24),
          merchantId: merchantRowId as any ?? null,
          title: body.title ?? null,
          firstName: body.first_name ?? null,
          middleName: body.middle_name ?? null,
          lastName: body.last_name ?? null,
          email: body.email,
          mobileCountryCode: body.mobile_country_code ?? null,
          mobile: body.mobile ?? null,
          password: passwordHash,
          userType: body.user_type ?? USER_TYPE_PENDING,
          timezone: body.timezone ?? "Asia/Kolkata",
          emailCode: sendEmail ? generateEmailCode() : null,
          emailCodeExpiry: sendEmail
            ? new Date(Date.now() + 10 * 60_000).toISOString()
            : null,
          emailVerifiedAt: sendEmail ? null : new Date(),
        },
      });

      if (body.country) {
        await tx.userInformation.create({
          data: {
            userId: created.id,
            uniqueId: uniqueId(24),
            country: body.country,
          },
        });
      }

      // Generate API credentials (apiKey, saltKey, RSA pair)
      await credentialService.generateAndStore(created.id, "user", tx);

      return created;
    });

    if (!user.emailVerifiedAt) {
      await UserAuthEmailService.registered(user);
    }

    return sendResponse(res, apiSuccess(101), 101, {
      user: {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode,
        mobile: user.mobile,
        email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
        user_type: Number(user.userType) === USER_TYPE_BUSINESS ? "BUSINESS" : "PERSONAL",
        role: "ADMIN",
      },
    });
  },
};
