import sequelize from "../config/database";
import Wallet from "../models/wallet.model";
import Transaction from "../models/transaction.model";
import { transactionToJSON } from "../resources/transaction.resource";
import * as constants from "../utils/constants";
import { getExchangeRate } from "../helpers/exchange.helper";


export const transfer = async (req: any, res: any) => {
    const t = await sequelize.transaction();
    try {
        const { sender_wallet_id, receiver_wallet_id, amount } = req.body;
        const senderWallet = await Wallet.findByPk(sender_wallet_id, { transaction: t });
        if (!senderWallet) {
            await t.rollback();
            return res.sendError(res.__("1404"), 1404);
        }
        const receiverWallet = await Wallet.findByPk(receiver_wallet_id, { transaction: t });
        if (!receiverWallet) {
            await t.rollback();
            return res.sendError(res.__("1405"), 1405);
        }
        const parsedAmount = parseFloat(amount);
        const remainingBalance = Number(senderWallet.remaining);
        if (remainingBalance < parsedAmount) {
            await t.rollback();
            return res.sendError(res.__("1406"), 1406);
        }
        const exchangeRate = await getExchangeRate(parsedAmount, senderWallet, receiverWallet);
        senderWallet.remaining = remainingBalance - parsedAmount;
        receiverWallet.remaining = Number(receiverWallet.remaining) + parsedAmount;
        receiverWallet.total = Number(receiverWallet.total) + parsedAmount;
        await senderWallet.save({ transaction: t });
        await receiverWallet.save({ transaction: t });
        const transactionRecord = await Transaction.create({
            sender_id: senderWallet.user_id,
            sender_wallet_id: senderWallet.id,
            sender_amount: parsedAmount,
            receiver_id: receiverWallet.user_id,
            receiver_wallet_id: receiverWallet.id,
            receiver_amount: parsedAmount,
            exchange_rate: 1.0,
            type: constants.TRANSACTION_TYPE_TRANSFER,
            status: constants.TRANSACTION_STATUS_COMPLETED,
        }, { transaction: t });
        await t.commit();
        const transactionResponse = transactionToJSON(transactionRecord, req);
        return res.sendResponse(transactionResponse, res.__("3014"), 3014);
    } catch (error: any) {
        await t.rollback();
        return res.handleError(error);
    }
}