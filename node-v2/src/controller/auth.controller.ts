import { Request, Response } from "express";
import PersonalAccessToken from "../models/personal_access_token.model";
import User from "../models/user.model";
import { userToJSON } from "../resources/user.resource";
import {
    comparePassword,
    generateAccessToken,
    generateUniqueId,
    hashPassword,
} from "../utils/common.utils";
import {
    TOKENABLE_TYPE_USER,
    TOKEN_ABILITY_AUTHENTICATION,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

/**
 * POST /api/user/register
 *
 * Creates a new user and returns the persisted row. The user still
 * needs to verify their email via /verify-otp (module to be migrated
 * next) before privileged endpoints will accept them.
 */
export const register = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const emailAddress = String(req.body.email).toLowerCase().trim();
        const plainPassword = String(req.body.password);

        const existingUser = await User.findOne({
            where: { email: emailAddress },
        });
        if (existingUser) {
            return res.sendError(res.__("1102"), 422, 422);
        }

        const hashedPassword = await hashPassword(plainPassword);
        const uniqueIdValue = generateUniqueId(24);

        const createdUser = await User.create({
            uniqueId: uniqueIdValue,
            email: emailAddress,
            password: hashedPassword,
            mobileCountryCode: req.body.mobile_country_code ?? null,
            mobile: req.body.mobile ?? null,
            userType: Number(req.body.user_type) || USER_TYPE_PERSONAL,
        });

        // Fetch again through the default scope so the password field
        // isn't included in the serialized response.
        const responseUser = await User.findByPk(createdUser.id);

        return res.sendResponse(
            responseUser ? userToJSON(responseUser, req) : null,
            res.__("101"),
            101,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/login
 *
 * Verifies email + password and issues a Sanctum-style opaque access
 * token. Response envelope, codes, and user shape match the legacy
 * /node LoginController exactly.
 */
export const login = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const emailAddress = String(req.body.email).toLowerCase().trim();
        const plainPassword = String(req.body.password);

        // Scope in the password column (which is excluded by default)
        // so we can verify against the stored argon2 hash.
        const authenticatingUser = await User.scope("withPassword").findOne({
            where: { email: emailAddress },
        });

        if (!authenticatingUser) {
            return res.sendError(res.__("125"), 125, 422);
        }

        const passwordMatches = await comparePassword(
            plainPassword,
            authenticatingUser.password,
        );
        if (!passwordMatches) {
            return res.sendError(res.__("125"), 125, 422);
        }

        // Revoke any existing regular-auth tokens for this user before
        // issuing a new one (mirrors the legacy behavior).
        await PersonalAccessToken.destroy({
            where: {
                tokenableType: TOKENABLE_TYPE_USER,
                tokenableId: authenticatingUser.id,
                name: TOKEN_ABILITY_AUTHENTICATION,
            },
        });

        const { plaintextToken, tokenFingerprint } = generateAccessToken();

        await PersonalAccessToken.create({
            tokenableType: TOKENABLE_TYPE_USER,
            tokenableId: authenticatingUser.id,
            name: TOKEN_ABILITY_AUTHENTICATION,
            token: tokenFingerprint,
            abilities: [TOKEN_ABILITY_AUTHENTICATION],
        });

        // Refetch through default scope so we don't leak the password
        // hash back to the client.
        const responseUser = await User.findByPk(authenticatingUser.id);

        return res.sendResponse(
            {
                user: responseUser ? userToJSON(responseUser, req) : null,
                access_token: plaintextToken,
            },
            res.__("104"),
            104,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/logout
 *
 * Revokes the current access token. Requires the authSanctum
 * middleware to have populated req.personalAccessToken.
 */
export const logout = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.personalAccessToken || !req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }

        await req.personalAccessToken.destroy();

        return res.sendResponse({}, res.__("105"), 105);
    } catch (error) {
        return res.handleError(error);
    }
};
