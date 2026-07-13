import { Request, Response } from "express";
import Wallet from "../models/wallet.model";
import Transaction from "../models/transaction.model";
import { transactionToJSON } from "../resources/transaction.resource";
import sequelize from "../config/database";
import * as constants from "../utils/constants";


export const withdraw = async (req: Request, res: Response): Promise<void> => {
    const t = await sequelize.transaction();
    try {
        const { wallet_id, amount } = req.body;
        const wallet = await Wallet.findByPk(wallet_id, { transaction: t });
        if (!wallet) {
            await t.rollback();
            return res.sendError(res.__("1304"), 1304);
        }
        const parsedAmount = parseFloat(amount);
        const remainingBalance = Number(wallet.remaining);
        if (remainingBalance < parsedAmount) {
            await t.rollback();
            return res.sendError(res.__("1305"), 1305);
        }
        wallet.remaining = remainingBalance - parsedAmount;
        wallet.onhold = Number(wallet.onhold) + parsedAmount;
        await wallet.save({ transaction: t });
        const transactionRecord = await Transaction.create(
            {
                sender_id: wallet.user_id,
                sender_wallet_id: wallet.id,
                sender_amount: parsedAmount,
                exchange_rate: 1.0,
                type: constants.TRANSACTION_TYPE_WITHDRAWAL,
                status: constants.TRANSACTION_STATUS_PENDING,
            },
            { transaction: t },
        );
        await t.commit();
        const transactionResponse = transactionToJSON(transactionRecord, req);
        return res.sendResponse(transactionResponse, res.__("3015"), 3015);
    } catch (error: any) {
        await t.rollback();
        return res.handleError(error);
    }
};
