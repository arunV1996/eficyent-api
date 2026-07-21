import { Request, Response } from "express";
import { getRedis } from "../config/redis";
import { randomTokenBase64Url } from "../helpers/crypto.helper";
import {
    issueTeamToken,
    revokeAllTeamTokens,
    revokeTeamToken,
} from "../helpers/team_token.helper";
import { forgotPasswordEmail } from "../helpers/email_templates.helper";
import { settingGet } from "../helpers/setting.helper";
import { generateEmailCode } from "../helpers/user_auth_email.helper";
import PasswordResetToken from "../models/password_reset_token.model";
import TeamMember from "../models/team_member.model";
import { teamMemberToJSON } from "../resources/team_member.resource";
import { sendMail } from "../services/mailer.service";
import {
    comparePassword,
    generateEmailCodeExpiry,
    hashPassword,
} from "../utils/common.utils";
import {
    TEAM_MEMBER_DISABLED,
    TEAM_MEMBER_INACTIVE,
    TEAM_MEMBER_ROLE_CORPORATE,
} from "../utils/constants";

/**
 * Mirror of TeamMembers\LoginController + ForgotPasswordController.
 *
 * Two login paths (role-gated): /team/login (non-corporate) and
 * /corporate/login (corporate). Members without an initialised
 * password get password_reset=true and no token; they follow up with
 * /team/force-reset-password.
 */

const PASSWORD_RESET_EXPIRY_MINUTES = 60;

const isSandbox = (): boolean => process.env.APP_IS_SANDBOX === "true";

const brand = async (): Promise<string> => {
    const appName = process.env.APP_NAME || "Eficyent";
    return (await settingGet<string>("site_name", appName)) || appName;
};

const loginCommon = async (
    req: Request,
    expectedCorporate: boolean,
    res: Response,
): Promise<void> => {
    const email = String(req.body.email).toLowerCase().trim();
    const member = await TeamMember.findOne({ where: { email } });
    if (!member) {
        return res.sendError(res.__("102"), 102, 400);
    }

    const valid = await comparePassword(
        String(req.body.password),
        member.password,
    );
    if (!valid) {
        return res.sendError(res.__("125"), 125, 400);
    }
    if (
        member.status === TEAM_MEMBER_INACTIVE ||
        member.status === TEAM_MEMBER_DISABLED
    ) {
        return res.sendError("Team member is inactive.", 160, 400);
    }

    const isCorporate = member.role === TEAM_MEMBER_ROLE_CORPORATE;
    if (expectedCorporate !== isCorporate) {
        return res.sendError(
            "Account type not allowed for this login flow.",
            185,
            400,
        );
    }

    const data: Record<string, unknown> = {
        user: teamMemberToJSON(member),
        password_reset: false,
    };

    if (!member.lastPasswordReset) {
        // Force reset before any token issuance.
        data.password_reset = true;
        return res.sendResponse(data, res.__("success.104"), 104);
    }

    // One active token per member (mirror of tokens()->delete()).
    await revokeAllTeamTokens(member.id);
    const issued = await issueTeamToken(member, null);
    data.access_token = issued.plaintext;
    return res.sendResponse(data, res.__("success.104"), 104);
};

/**
 * POST /api/team/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        return await loginCommon(req, false, res);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/corporate/login
 */
export const corporateLogin = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        return await loginCommon(req, true, res);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/team/logout
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.teamMember || !req.tokenId) {
            return res.sendError(res.__("102"), 102, 400);
        }
        await revokeTeamToken(req.tokenId, req.teamMember.id);
        return res.sendResponse([], res.__("success.105"), 105);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/team/force-reset-password — first-login password set
 * (anonymous; gated by lastPasswordReset being null).
 */
export const forceResetPassword = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const member = await TeamMember.findOne({ where: { email } });
        if (!member) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (member.lastPasswordReset) {
            return res.sendError("Password already initialised.", 161, 400);
        }

        const sameAsExisting = await comparePassword(
            String(req.body.password),
            member.password,
        );
        if (sameAsExisting) {
            return res.sendError(res.__("126"), 126, 400);
        }

        const updated = await member.update({
            password: await hashPassword(String(req.body.password)),
            lastPasswordReset: new Date(),
        });
        const issued = await issueTeamToken(updated, null);
        return res.sendResponse(
            { access_token: issued.plaintext },
            res.__("success.111"),
            111,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/team/forgot-password/send-reset-link
 */
export const sendResetLink = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const member = await TeamMember.findOne({ where: { email } });
        if (!member) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const code = generateEmailCode();
        await member.update({
            emailCode: code,
            emailCodeExpiry: generateEmailCodeExpiry(10),
        });

        // Mirror of TeamAuthEmailService.forgotPassword — reuses the
        // user-side template with the member's name (best-effort).
        try {
            const template = forgotPasswordEmail({
                brand: await brand(),
                firstName: member.name,
                email: member.email,
                emailCode: code,
            });
            await sendMail({ to: member.email, ...template });
        } catch {
            // Mail failures never break the response.
        }
        return res.sendResponse({ email: member.email }, res.__("success.109"), 109);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/team/forgot-password/verify-code — 30-minute lockout after
 * 5 failed attempts (Redis-backed, mirror of the legacy gate).
 */
export const verifyCode = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const email = String(req.body.email).toLowerCase().trim();
        const member = await TeamMember.findOne({ where: { email } });
        if (!member) {
            return res.sendError(res.__("102"), 102, 400);
        }

        const redis = getRedis();
        const blockedKey = `team_email_blocked:${member.email}`;
        const attemptsKey = `team_email_attempts:${member.email}`;
        if (await redis.exists(blockedKey)) {
            return res.sendError(res.__("134"), 134, 400);
        }

        if (!isSandbox()) {
            if (member.emailCode !== String(req.body.verification_code)) {
                const attempts = await redis.incr(attemptsKey);
                if (attempts === 1) {
                    await redis.expire(attemptsKey, 10 * 60);
                }
                if (attempts >= 5) {
                    await redis.set(blockedKey, "1", "EX", 30 * 60);
                }
                return res.sendError(res.__("142"), 142, 400);
            }
        }
        await redis.del(attemptsKey);

        const token = randomTokenBase64Url(32);
        await PasswordResetToken.destroy({
            where: { email: member.email },
        });
        await PasswordResetToken.create({
            email: member.email,
            token,
            createdAt: new Date(),
        });
        await member.update({ emailCode: null, emailCodeExpiry: null });

        return res.sendResponse(
            { reset_token: token, email: member.email },
            res.__("success.110"),
            110,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/team/forgot-password/reset-password
 */
export const resetPassword = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const reset = await PasswordResetToken.findOne({
            where: { token: String(req.body.reset_token) },
        });
        if (!reset) {
            return res.sendError(res.__("128"), 128, 400);
        }
        if (
            !reset.createdAt ||
            reset.createdAt.getTime() +
                PASSWORD_RESET_EXPIRY_MINUTES * 60_000 <
                Date.now()
        ) {
            return res.sendError(res.__("141"), 141, 400);
        }
        const member = await TeamMember.findOne({
            where: { email: reset.email },
        });
        if (!member) {
            return res.sendError(res.__("102"), 102, 400);
        }

        await member.update({
            password: await hashPassword(String(req.body.password)),
            lastPasswordReset: new Date(),
        });
        await PasswordResetToken.destroy({
            where: { token: String(req.body.reset_token) },
        });
        return res.sendResponse([], res.__("success.111"), 111);
    } catch (error) {
        return res.handleError(error);
    }
};
