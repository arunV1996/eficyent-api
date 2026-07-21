import { randomBytes } from "crypto";
import { Request, Response } from "express";
import sequelize from "../config/database";
import { getRedis } from "../config/redis";
import { hashPassword } from "../utils/common.utils";
import {
    generateEmailCode,
    UserAuthEmail,
} from "../helpers/user_auth_email.helper";
import PasswordResetToken from "../models/password_reset_token.model";
import User from "../models/user.model";

/**
 * Mirror of Api\ForgotPasswordController:
 *   send-reset-link : writes email_code, mails the OTP
 *   verify-code     : 10-attempts-then-30-min lock per email (Redis)
 *   reset-password  : PasswordReset row + 60-minute token expiry
 *
 * APP_IS_SANDBOX=true skips the OTP value check in verify-code.
 */

const RESET_LINK_TTL_MIN = 10;
const PASSWORD_RESET_EXPIRY_MIN = 60;

const isSandbox = (): boolean => process.env.APP_IS_SANDBOX === "true";

/**
 * POST /api/user/forgot-password/send-reset-link
 */
export const sendResetLink = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        await user.update({
            emailCode: generateEmailCode(),
            emailCodeExpiry: new Date(
                Date.now() + RESET_LINK_TTL_MIN * 60_000,
            ).toISOString(),
        });
        await UserAuthEmail.forgotPassword(user);

        return res.sendResponse({ email: user.email }, res.__("success.109"), 109);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/forgot-password/verify-code
 */
export const verifyCode = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const verificationCode = String(req.body.verification_code);

        const user = await User.unscoped().findOne({
            where: { email },
        });
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const redis = getRedis();
        const blockedKey = `email_blocked:${user.email}`;
        const attemptsKey = `email_attempts:${user.email}`;

        if (await redis.exists(blockedKey)) {
            return res.sendError(res.__("134"), 134, 400);
        }

        if (!isSandbox()) {
            if (user.emailCode !== verificationCode) {
                const attempts = await redis.incr(attemptsKey);
                if (attempts === 1) {
                    await redis.expire(attemptsKey, 10 * 60);
                }
                if (attempts >= 10) {
                    await redis.set(blockedKey, "1", "EX", 30 * 60);
                }
                return res.sendError(res.__("142"), 142, 400);
            }
        }
        await redis.del(attemptsKey);

        const token = randomBytes(32).toString("hex");
        await sequelize.transaction(async (databaseTransaction) => {
            await PasswordResetToken.destroy({
                where: { email: user.email },
                transaction: databaseTransaction,
            });
            await PasswordResetToken.create(
                { email: user.email, token, createdAt: new Date() },
                { transaction: databaseTransaction },
            );
            await user.update(
                { emailCode: null, emailCodeExpiry: null },
                { transaction: databaseTransaction },
            );
        });

        return res.sendResponse(
            { reset_token: token, email: user.email },
            res.__("success.110"),
            110,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/forgot-password/reset-password
 */
export const resetPassword = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const resetToken = String(req.body.reset_token);
        const newPassword = String(req.body.password);

        const resetRow = await PasswordResetToken.findOne({
            where: { token: resetToken },
        });
        if (!resetRow) {
            return res.sendError(res.__("128"), 128, 400);
        }

        const expiryMs = PASSWORD_RESET_EXPIRY_MIN * 60_000;
        if (
            !resetRow.createdAt ||
            resetRow.createdAt.getTime() + expiryMs < Date.now()
        ) {
            return res.sendError(res.__("141"), 141, 400);
        }

        const user = await User.findOne({ where: { email: resetRow.email } });
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const newHash = await hashPassword(newPassword);
        await sequelize.transaction(async (databaseTransaction) => {
            await user.update(
                { password: newHash },
                { transaction: databaseTransaction },
            );
            await PasswordResetToken.destroy({
                where: { token: resetToken },
                transaction: databaseTransaction,
            });
        });

        return res.sendResponse({}, res.__("success.111"), 111);
    } catch (error) {
        return res.handleError(error);
    }
};
