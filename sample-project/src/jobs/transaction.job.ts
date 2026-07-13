import { Op } from "sequelize";
import Transaction from "../models/transaction.model";
import * as constants from "../utils/constants";

/**
 * Scans the transactions table and updates the status of any transaction
 * from "pending" to "processing" if current time is greater than 10 minutes
 * of its created time.
 */
export const processPendingTransactions = async (): Promise<void> => {
    try {
        // Current time is greater than 10 minutes of created time means:
        // currentTime - created_at > 10 minutes => created_at < currentTime - 10 minutes
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        const [updatedCount] = await Transaction.update(
            {
                status: constants.TRANSACTION_STATUS_PROCESSING,
            },
            {
                where: {
                    status: constants.TRANSACTION_STATUS_PENDING,
                    created_at: {
                        [Op.lt]: tenMinutesAgo,
                    },
                },
            },
        );

        if (updatedCount > 0) {
            console.log(
                `[Job] Successfully changed status to processing for ${updatedCount} transaction(s).`,
            );
        }
    } catch (error) {
        console.error("[Job] Error processing pending transactions:", error);
    }
};
