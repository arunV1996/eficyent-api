import { Request, Response } from "express";
import { getBusinessModel } from "../helpers/merchant.helper";
import Merchant from "../models/merchant.model";
import PersonalAccessToken from "../models/personal_access_token.model";
import User from "../models/user.model";
import UserDocument from "../models/user_document.model";
import UserInformation from "../models/user_information.model";
import { fullUserToJSON } from "../resources/user.resource";
import { comparePassword, hashPassword } from "../utils/common.utils";
import { ACTIVE } from "../utils/constants";

/**
 * GET /api/user/profile
 *
 * Full profile payload: user fields + user/business information +
 * signed document URLs + merchant flags. Mirrors
 * profileController.profile in /node, including the empty-envelope
 * response shape {success, message, code: "", data}.
 */
export const profile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const userId = req.user.id;
        const [information, documents, merchant] = await Promise.all([
            UserInformation.findOne({ where: { userId } }),
            UserDocument.findAll({ where: { userId } }),
            Merchant.findOne({
                where: { userId },
                attributes: ["id"],
            }),
        ]);

        const businessModel = await getBusinessModel(
            merchant?.id ?? req.user.merchantId,
        );

        return res.sendEmptyEnvelope(
            {
                user: await fullUserToJSON(
                    req.user,
                    information,
                    documents,
                    !!merchant,
                    businessModel,
                ),
            },
            "",
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/change-password
 *
 * Verifies the current password, updates to a new hash, and revokes
 * the caller's active access token so the client is forced to log in
 * again with the new credentials. Mirrors profileController.changePassword
 * in /node exactly, including the "new password must not equal the old
 * password" guard.
 */
export const changePassword = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user || !req.personalAccessToken) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const oldPassword = String(req.body.old_password);
        const newPassword = String(req.body.password);

        // We need the argon2 hash for verification; the default scope
        // strips password, so query again with the withPassword scope.
        const userWithPassword = await User.scope("withPassword").findByPk(
            req.user.id,
        );

        if (!userWithPassword) {
            return res.sendError(res.__("401"), 401, 401);
        }

        const oldPasswordMatches = await comparePassword(
            oldPassword,
            userWithPassword.password,
        );
        if (!oldPasswordMatches) {
            return res.sendError(res.__("125"), 125, 400);
        }

        const sameAsCurrent = await comparePassword(
            newPassword,
            userWithPassword.password,
        );
        if (sameAsCurrent) {
            return res.sendError(res.__("126"), 126, 400);
        }

        const newPasswordHash = await hashPassword(newPassword);
        userWithPassword.password = newPasswordHash;
        await userWithPassword.save();

        // Revoke the token that made this request so the client must
        // re-authenticate with the new password.
        await PersonalAccessToken.destroy({
            where: { id: req.personalAccessToken.id },
        });

        return res.sendEmptyEnvelope({}, "Password changed successfully.");
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/update-tour-status
 *
 * Marks the caller's onboarding tour as completed. If it's already
 * completed we return the 148 error code, matching the legacy
 * profileController.updateTourStatus behavior.
 */
export const updateTourStatus = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }

        if (req.user.tourStatus === ACTIVE) {
            return res.sendError(res.__("148"), 148, 400);
        }

        req.user.tourStatus = ACTIVE;
        await req.user.save();

        return res.sendEmptyEnvelope({}, "Tour status updated successfully.");
    } catch (error) {
        return res.handleError(error);
    }
};
