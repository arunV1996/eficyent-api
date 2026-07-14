import { NextFunction, Request, Response } from "express";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import {
    MERCHANT_TYPE_PAYINCOLLECTION,
    MERCHANT_TYPE_PAYOUTINTEGRATOR,
} from "../utils/constants";

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            merchant?: Merchant;
        }
    }
}

/**
 * Mirror of the legacy ValidateMerchant middleware.
 *
 * When the X-Merchant-Id header is present, the merchant is resolved
 * and attached to the request. For integrator-type merchants
 * (payout-integrator / payin-collection) the X-User-Id header selects
 * which of the merchant's sub-users the request acts as, and req.user
 * is overridden accordingly.
 *
 * Error codes match the legacy service:
 *   151 -> Invalid merchant
 *   192 -> X-User-Id header required
 *   193 -> User not found for the merchant
 */
export const validateMerchant = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const merchantHeader = req.header("x-merchant-id");
        if (!merchantHeader) {
            return next();
        }

        const merchant = await Merchant.findOne({
            where: { uniqueId: merchantHeader },
        });
        if (!merchant) {
            return res.sendError(res.__("151"), 151, 401);
        }
        req.merchant = merchant;

        if (
            merchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
            merchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR
        ) {
            const userIdHeader = req.header("x-user-id");
            if (!userIdHeader) {
                return res.sendError(res.__("192"), 192, 401);
            }

            const merchantSubUser = await User.findOne({
                where: { uniqueId: userIdHeader, merchantId: merchant.id },
            });
            if (!merchantSubUser) {
                return res.sendError(res.__("193"), 193, 401);
            }
            req.user = merchantSubUser;
        }

        next();
    } catch (error) {
        res.handleError(error);
    }
};
