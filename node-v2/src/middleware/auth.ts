import { NextFunction, Request, Response } from "express";
import PersonalAccessToken from "../models/personal_access_token.model";
import User from "../models/user.model";
import { fingerprintToken } from "../utils/common.utils";
import { TOKENABLE_TYPE_USER } from "../utils/constants";

/**
 * Attach the authenticated user (and the active token row) onto the
 * request object for downstream handlers.
 */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: User;
            personalAccessToken?: PersonalAccessToken;
        }
    }
}

/**
 * Sanctum-equivalent bearer authentication middleware.
 *
 * The client presents an opaque token via the `Authorization: Bearer
 * <token>` header. We rebuild the SHA-256 fingerprint, look it up in
 * personal_access_tokens, load the User row, and attach both to req.
 *
 * Error codes match the current /node behavior:
 *   1006 -> No authentication token provided
 *   1007 -> Invalid or expired authentication token
 *   1002 -> User not found
 */
export const authSanctum = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const authorizationHeader = req.headers.authorization;
        if (
            !authorizationHeader ||
            !authorizationHeader.startsWith("Bearer ")
        ) {
            res.sendError(res.__("401"), 401, 401);
            return;
        }

        const plaintextToken = authorizationHeader.slice("Bearer ".length).trim();
        if (!plaintextToken) {
            res.sendError(res.__("401"), 401, 401);
            return;
        }

        const tokenFingerprint = fingerprintToken(plaintextToken);

        const tokenRow = await PersonalAccessToken.findOne({
            where: {
                token: tokenFingerprint,
                tokenableType: TOKENABLE_TYPE_USER,
            },
        });

        if (!tokenRow) {
            res.sendError(res.__("401"), 401, 401);
            return;
        }

        if (tokenRow.expiresAt && tokenRow.expiresAt.getTime() < Date.now()) {
            res.sendError(res.__("401"), 401, 401);
            return;
        }

        const user = await User.findByPk(tokenRow.tokenableId);
        if (!user) {
            res.sendError(res.__("401"), 401, 401);
            return;
        }

        tokenRow.lastUsedAt = new Date();
        await tokenRow.save();

        req.user = user;
        req.personalAccessToken = tokenRow;
        next();
    } catch (error) {
        res.handleError(error);
    }
};

/**
 * Equivalent of the Laravel onboarding gate: users must have completed
 * onboarding step 4 before touching business endpoints. Legacy quirk
 * preserved: the failure responds HTTP 200 with error_code 114.
 */
export const onboardingShouldBeCompleted = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const ONBOARDING_STEP_FOUR_COMPLETED = 4;
    if (!req.user) {
        return res.sendError(res.__("401"), 401, 401);
    }
    if (req.user.onboardingStep !== ONBOARDING_STEP_FOUR_COMPLETED) {
        return res.sendError(res.__("114"), 114, 200);
    }
    next();
};

/**
 * Equivalent of the Laravel `email_should_be_verified` middleware.
 * Must run after authSanctum. Legacy contract: HTTP 403 with
 * error_code 403 "Email not verified."
 */
export const emailShouldBeVerified = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.user) {
        return res.sendError(res.__("401"), 401, 401);
    }
    if (!req.user.emailVerifiedAt) {
        return res.sendError(res.__("403"), 403, 403);
    }
    next();
};
