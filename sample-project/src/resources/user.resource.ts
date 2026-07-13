import { Request } from "express";
import { formatDate } from "../utils/common.utils";

export const userToJSON = (
    user: any,
    req: Request,
    accessToken?: string,
): Record<string, any> => {
    const response: Record<string, any> = {
        id: user.id,
        email: user.email,
        created_at: formatDate(user.created_at),
        updated_at: formatDate(user.updated_at),
    };
    if (accessToken) {
        response.access_token = accessToken;
    }
    return response;
};
