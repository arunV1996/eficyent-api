import { NextFunction, Request, Response } from "express";
import PersonalAccessToken from "../models/personal_access_token.model";
import User from "../models/user.model";
import { authenticateToken } from "../helpers/token.helper";
import { USER_TYPE_BUSINESS } from "../utils/constants";

/**
 * Attach the authenticated user (and the active token id) onto the
 * request object for downstream handlers.
 */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: User;
            tokenId?: number;
            personalAccessToken?: PersonalAccessToken;
        }
    }
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * Express equivalent of `auth:sanctum` (mirror of the legacy
 * authSanctum):
 *
 *   - reads Authorization: Bearer <id>|<random>
 *   - verifies the peppered token hash against personal_access_tokens
 *   - touches the Redis session (sliding inactivity TTL); a missing
 *     session is a forced logout
 *   - attaches req.user and req.tokenId
 *
 * On failure: HTTP 401 with error_code 401, no detail leak.
 */
export const authSanctum = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const authorizationHeader = req.header("authorization");
        if (!authorizationHeader) {
            return res.sendError(res.__("401"), 401, 401);
        }
        const bearerMatch = BEARER_PATTERN.exec(authorizationHeader);
        if (!bearerMatch) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const result = await authenticateToken(bearerMatch[1]);
        if (!result) {
            return res.sendError(res.__("401"), 401, 401);
        }

        req.user = result.user;
        req.tokenId = result.tokenId;
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

/**
 * Only business users may pass (mirror of the legacy
 * businessUserAccess): 401 envelope with code 133 otherwise.
 */
export const businessUserAccess = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (!req.user) {
        return res.sendError(res.__("401"), 401, 401);
    }
    if (req.user.userType !== USER_TYPE_BUSINESS) {
        return res.sendError(
            "Only business users can access this resource.",
            133,
            401,
        );
    }
    next();
};
