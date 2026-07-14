import { Request, Response } from "express";
import { issueToken } from "../helpers/token.helper";
import { UserAuthEmail } from "../helpers/user_auth_email.helper";
import User from "../models/user.model";
import { TOKEN_ABILITY_AUTHENTICATION } from "../utils/constants";

/**
 * Mirror of Api\VerifyEmailController.
 * APP_IS_SANDBOX=true skips the OTP value/expiry check (dev/testing).
 */

const shapeVerifyUser = (user: User): Record<string, unknown> => ({
    unique_id: user.uniqueId,
    email: user.email,
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
});

const isSandbox = (): boolean => process.env.APP_IS_SANDBOX === "true";

/**
 * POST /api/user/verify-otp
 */
export const verifyOtp = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const otp = String(req.body.otp);

        const user = await User.unscoped().findOne({
            where: { email },
        });
        if (!user) {
            return res.sendError(res.__("s102"), 102, 400);
        }

        if (!isSandbox()) {
            if (user.emailCode !== otp) {
                return res.sendError(res.__("103"), 103, 400);
            }
            if (user.emailCodeExpiry) {
                const expiry = Date.parse(user.emailCodeExpiry);
                if (Number.isFinite(expiry) && expiry < Date.now()) {
                    return res.sendError(res.__("104"), 104, 400);
                }
            }
        }

        await user.update({
            emailCode: null,
            emailCodeExpiry: null,
            emailVerifiedAt: new Date(),
        });

        const issued = await issueToken(
            user,
            [TOKEN_ABILITY_AUTHENTICATION],
            null,
        );
        await UserAuthEmail.emailVerified(user);

        return res.sendResponse(
            {
                user: shapeVerifyUser(user),
                access_token: issued.plaintext,
            },
            res.__("s102"),
            102,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/resend-otp
 */
export const resendOtp = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.sendError(res.__("s102"), 102, 400);
        }
        if (user.emailVerifiedAt) {
            return res.sendError(res.__("106"), 106, 400);
        }
        await UserAuthEmail.emailVerificationCode(user);
        return res.sendResponse({}, res.__("s103"), 103);
    } catch (error) {
        return res.handleError(error);
    }
};
