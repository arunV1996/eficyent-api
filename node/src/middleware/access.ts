import { NextFunction, Request, Response } from "express";
import { ApiException } from "../helpers/errors";
import {
  ONBOARDING_STEP_FOUR_COMPLETED,
  USER_TYPE_BUSINESS,
} from "../helpers/constants";
import { prisma } from "../db/prisma";
import { Merchant, User } from "@prisma/client";

/**
 * Mirror of Laravel access middlewares.
 *
 *   businessUserAccess        -> only USER_TYPE_BUSINESS may pass (133)
 *   onboardingShouldBeCompleted -> users must have onboarding_step == 4 (114)
 *   validateMerchant          -> when X-Merchant-Id is set on integrator
 *                                merchants, override req.user with the
 *                                X-User-Id-resolved merchant subuser
 */

export function businessUserAccess(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new ApiException(401, undefined, 401));
  if (req.user.userType !== USER_TYPE_BUSINESS) {
    return next(new ApiException(133, undefined, 401));
  }
  next();
}

export function onboardingShouldBeCompleted(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) return next(new ApiException(401, undefined, 401));
  if (req.user.onboardingStep !== ONBOARDING_STEP_FOUR_COMPLETED) {
    return next(new ApiException(114, undefined, 200));
  }
  next();
}

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    merchant?: Merchant;
  }
}

const MERCHANT_TYPE_PAYINCOLLECTION = 4;
const MERCHANT_TYPE_PAYOUTINTEGRATOR = 3;

export async function validateMerchant(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const merchantId = req.header("x-merchant-id");
    if (!merchantId) {
      return next();
    }
    const merchant = await prisma().merchant.findFirst({
      where: { uniqueId: merchantId },
    });
    if (!merchant) {
      return next(new ApiException(151, undefined, 401));
    }
    req.merchant = merchant;

    if (
      merchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
      merchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR
    ) {
      const userIdHeader = req.header("x-user-id");
      if (!userIdHeader) {
        return next(new ApiException(192, undefined, 401));
      }
      const subUser: User | null = await prisma().user.findFirst({
        where: { uniqueId: userIdHeader, merchantId: merchant.id as any },
      });
      if (!subUser) {
        return next(new ApiException(193, undefined, 401));
      }
      req.user = subUser;
    }
    next();
  } catch (err) {
    next(err);
  }
}
