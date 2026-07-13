import { Request, Response } from "express";
import Wallet from "../models/wallet.model";
import Transaction from "../models/transaction.model";
import { transactionToJSON } from "../resources/transaction.resource";
import sequelize from "../config/database";
import * as constants from "../utils/constants";


export const deposit = async (req: Request, res: Response): Promise<void> => {
    const t = await sequelize.transaction();
    try {
        const { wallet_id, amount } = req.body;
        const wallet = await Wallet.findByPk(wallet_id, { transaction: t });
        if (!wallet) {
            await t.rollback();
            return res.sendError(res.__("1204"), 1204);
        }
        const parsedAmount = parseFloat(amount);
        wallet.total = Number(wallet.total) + parsedAmount;
        wallet.remaining = Number(wallet.remaining) + parsedAmount;
        await wallet.save({ transaction: t });
        const transactionRecord = await Transaction.create(
            {
                receiver_id: wallet.user_id,
                receiver_wallet_id: wallet.id,
                receiver_amount: parsedAmount,
                exchange_rate: 1.0,
                type: constants.TRANSACTION_TYPE_DEPOSIT,
                status: constants.TRANSACTION_STATUS_COMPLETED,
            },
            { transaction: t },
        );
        await t.commit();
        const transactionResponse = transactionToJSON(transactionRecord, req);
        return res.sendResponse(transactionResponse, res.__("3014"), 3014);
    } catch (error: any) {
        await t.rollback();
        return res.handleError(error);
    }
};
