import { Request } from "express";
import User from "../models/user.model";
import { USER_TYPE_BUSINESS } from "../utils/constants";

/**
 * Serializes a User Sequelize instance for the API response.
 *
 * The output shape matches the legacy /node LoginController response
 * exactly so existing frontend and white-label consumers see no change.
 */
export const userToJSON = (
    user: User,
    _req: Request,
    accessToken?: string,
): Record<string, unknown> => {
    const response: Record<string, unknown> = {
        unique_id: user.uniqueId,
        email: user.email,
        mobile_country_code: user.mobileCountryCode ?? "",
        mobile: user.mobile ?? "",
        email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
        user_type:
            Number(user.userType) === USER_TYPE_BUSINESS
                ? "BUSINESS"
                : "PERSONAL",
        is_tfa_setup_completed: user.isTfaSetupCompleted ? "YES" : "NO",
        is_tfa_enabled: user.isTfaEnabled ? "YES" : "NO",
    };

    if (accessToken) {
        response.access_token = accessToken;
    }

    return response;
};
