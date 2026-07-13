import { Request } from "express";
import { formatDate } from "../utils/common.utils";

export const transactionToJSON = (
    transaction: any,
    req: Request,
): Record<string, any> => {
    return {
        id: transaction.id,
        sender_id: transaction.sender_id,
        receiver_id: transaction.receiver_id,
        sender_wallet_id: transaction.sender_wallet_id,
        receiver_wallet_id: transaction.receiver_wallet_id,
        sender_amount: transaction.sender_amount
            ? parseFloat(transaction.sender_amount)
            : null,
        receiver_amount: transaction.receiver_amount
            ? parseFloat(transaction.receiver_amount)
            : null,
        exchange_rate: transaction.exchange_rate
            ? parseFloat(transaction.exchange_rate)
            : null,
        type: transaction.type,
        status: transaction.status,
        created_at: formatDate(transaction.created_at),
        updated_at: formatDate(transaction.updated_at),
    };
};
