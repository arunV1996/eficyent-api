import { Request } from "express";
import { formatDate } from "../utils/common.utils";

export const walletToJSON = (
    wallet: any,
    req: Request,
): Record<string, any> => {
    return {
        id: wallet.id,
        user_id: wallet.user_id,
        currency: wallet.currency,
        total: parseFloat(wallet.total),
        remaining: parseFloat(wallet.remaining),
        onhold: parseFloat(wallet.onhold),
        used: parseFloat(wallet.used),
        created_at: formatDate(wallet.created_at),
        updated_at: formatDate(wallet.updated_at),
    };
};
