import Decimal from "decimal.js";
import { Op } from "sequelize";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Merchant from "../models/merchant.model";
import Quote from "../models/quote.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import {
    DEPOSIT_TRANSACTION_COMPLETED,
    MERCHANT_TYPE_PAYINCOLLECTION,
    MORPH_VIRTUAL_ACCOUNT,
    QUOTE_SUBMITTED,
    TEAM_MEMBER_ROLE_CORPORATE,
    TRANSACTION_TYPE_CREDIT,
    TRANSACTION_TYPE_DEBIT,
    WALLET_TRANSACTION_COMPLETED,
} from "../utils/constants";

/**
 * Balance engine (mirror of the legacy balanceService). All arithmetic
 * runs through decimal.js — never floats — because these values gate
 * payouts and land in ledger rows.
 */

const ZERO = new Decimal(0);

const sumColumn = async (
    model: {
        sum: (
            column: string,
            options: { where: Record<string, unknown> },
        ) => Promise<number | string | null>;
    },
    column: string,
    where: Record<string, unknown>,
): Promise<Decimal> => {
    const total = await model.sum(column, { where });
    return total === null || total === undefined
        ? ZERO
        : new Decimal(String(total));
};

/**
 * Mirror of Helper::bankBalance for a VirtualAccount:
 *
 *   balance =
 *       sum(deposit_transactions.total_amount, status=COMPLETED)
 *     - sum(beneficiary_transactions.total_amount via submitted quotes)
 *     - sum(quote.total_sending_amount for COMPLETED wallet credits)
 *
 * PAYINCOLLECTION sub-accounts additionally scope deposit credits by
 * the user's memo; corporate team members are scoped to their own
 * transactions.
 */
export const computeBankBalance = async (
    user: User,
    virtualAccount: VirtualAccount,
    teamMember: { role: number; id: number } | null = null,
): Promise<Decimal> => {
    let isPayinCollection = false;
    if (user.merchantId) {
        const merchant = await Merchant.findByPk(user.merchantId);
        if (merchant?.type === MERCHANT_TYPE_PAYINCOLLECTION) {
            isPayinCollection = true;
        }
    }

    const isCorporateTeamMember =
        teamMember !== null && teamMember.role === TEAM_MEMBER_ROLE_CORPORATE;

    const depositWhere: Record<string, unknown> = {
        userId: user.id,
        virtualAccountId: virtualAccount.id,
        status: DEPOSIT_TRANSACTION_COMPLETED,
        ...(isPayinCollection && user.memo ? { memo: user.memo } : {}),
        ...(isCorporateTeamMember ? { teamMemberId: teamMember!.id } : {}),
    };

    const [depositTotal, submittedQuotes] = await Promise.all([
        sumColumn(DepositTransaction, "total_amount", depositWhere),
        Quote.findAll({
            where: {
                sourceType: MORPH_VIRTUAL_ACCOUNT,
                sourceId: virtualAccount.id,
                status: QUOTE_SUBMITTED,
            },
            attributes: ["id", "totalSendingAmount"],
        }),
    ]);

    let payoutTotal = ZERO;
    let walletCreditTotal = ZERO;
    if (submittedQuotes.length > 0) {
        const quoteIds = submittedQuotes.map((quote) => quote.id);

        payoutTotal = await sumColumn(
            BeneficiaryTransaction,
            "total_amount",
            {
                userId: user.id,
                quoteId: { [Op.in]: quoteIds },
                ...(isCorporateTeamMember
                    ? { teamMemberId: teamMember!.id }
                    : {}),
            },
        );

        if (!isCorporateTeamMember) {
            const walletCredits = await WalletTransaction.findAll({
                where: {
                    userId: user.id,
                    quoteId: { [Op.in]: quoteIds },
                    type: TRANSACTION_TYPE_CREDIT,
                    status: WALLET_TRANSACTION_COMPLETED,
                },
                attributes: ["quoteId"],
            });
            for (const walletCredit of walletCredits) {
                const matchingQuote = submittedQuotes.find(
                    (quote) => quote.id === walletCredit.quoteId,
                );
                if (matchingQuote?.totalSendingAmount) {
                    walletCreditTotal = walletCreditTotal.plus(
                        matchingQuote.totalSendingAmount,
                    );
                }
            }
        }
    }

    return depositTotal.minus(payoutTotal).minus(walletCreditTotal);
};

/**
 * Mirror of Helper::getWalletBalance. Credits count only when
 * COMPLETED; debits count the moment they're inserted (matching
 * Laravel exactly).
 */
export const getWalletBalance = async (
    user: User,
    wallet: Wallet,
): Promise<Decimal> => {
    const [creditTotal, debitTotal] = await Promise.all([
        sumColumn(WalletTransaction, "total_amount", {
            userId: user.id,
            walletId: wallet.id,
            type: TRANSACTION_TYPE_CREDIT,
            status: WALLET_TRANSACTION_COMPLETED,
        }),
        sumColumn(WalletTransaction, "total_amount", {
            userId: user.id,
            walletId: wallet.id,
            type: TRANSACTION_TYPE_DEBIT,
        }),
    ]);
    return creditTotal.minus(debitTotal);
};
