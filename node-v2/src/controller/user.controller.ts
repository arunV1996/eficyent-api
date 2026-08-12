import { Request, Response } from "express";
import { Op } from "sequelize";
import {
    computeBankBalance,
    getWalletBalance,
} from "../helpers/balance.helper";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import UserInformation from "../models/user_information.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import {
    MERCHANT_TYPE_WHITELABEL,
    ONBOARDING_STEP_FOUR_COMPLETED,
} from "../utils/constants";

/**
 * Mirror of Laravel UsersController::merchant_balances — an internal
 * reporting feed (guarded by the Processing API key middleware) that
 * walks every merchant, resolves its onboarded users (whitelabel
 * merchants through their sub-merchant users, everyone else through
 * merchant_id), and reports positive bank and wallet balances.
 */

interface MerchantBankBalance {
    merchant_name: string;
    balance: number;
    currency: string;
}

interface WalletBalanceGroup {
    merchant_name: string;
    wallets: { currency: string; balance: number }[];
}

/**
 * User display name: full name first, then the business/legal name
 * from user_informations, then the email as a last resort (mirror of
 * the Laravel user name accessor chain).
 */
const displayName = async (user: User): Promise<string> => {
    const fullName = [user.firstName, user.lastName]
        .filter(Boolean)
        .map((namePart) => String(namePart).trim())
        .join(" ")
        .trim();
    if (fullName) {
        return fullName;
    }
    const information = await UserInformation.findOne({
        where: { userId: user.id },
    });
    return (
        information?.businessName || information?.legalName || user.email
    );
};

/**
 * GET /api/user/merchant_balances
 */
export const merchantBalances = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const merchants = await Merchant.findAll();

        const merchantBankBalances: MerchantBankBalance[] = [];
        const walletRows: {
            user_name: string;
            currency: string;
            balance: number;
        }[] = [];

        for (const merchant of merchants) {
            // Whitelabel merchants report through their sub-merchant
            // users (merchant_id = whitelabel + sub_merchant_id
            // assigned); everyone else through their direct users.
            const users = await User.findAll({
                where:
                    merchant.type === MERCHANT_TYPE_WHITELABEL
                        ? {
                              merchantId: merchant.id,
                              subMerchantId: { [Op.ne]: null },
                              onboardingStep: ONBOARDING_STEP_FOUR_COMPLETED,
                          }
                        : {
                              merchantId: merchant.id,
                              onboardingStep: ONBOARDING_STEP_FOUR_COMPLETED,
                          },
            });

            for (const user of users) {
                const userName = await displayName(user);

                const virtualAccounts = await VirtualAccount.findAll({
                    where: { userId: user.id },
                });
                for (const virtualAccount of virtualAccounts) {
                    const bankBalance = await computeBankBalance(
                        user,
                        virtualAccount,
                    );
                    if (bankBalance.greaterThan(0)) {
                        merchantBankBalances.push({
                            merchant_name: merchant.name,
                            balance: bankBalance.toNumber(),
                            currency: virtualAccount.currency,
                        });
                    }
                }

                const wallets = await Wallet.findAll({
                    where: { userId: user.id },
                });
                for (const wallet of wallets) {
                    const walletBalance = await getWalletBalance(user, wallet);
                    if (walletBalance.greaterThan(0)) {
                        walletRows.push({
                            user_name: userName,
                            currency: wallet.currency,
                            balance: walletBalance.toNumber(),
                        });
                    }
                }
            }
        }

        // Wallet balances: one entry per (user, currency), grouped
        // into an array of { merchant_name, wallets } objects.
        const seenWalletKeys = new Set<string>();
        const walletGroups = new Map<string, WalletBalanceGroup>();
        for (const row of walletRows) {
            const dedupKey = `${row.user_name}|${row.currency}`;
            if (seenWalletKeys.has(dedupKey)) {
                continue;
            }
            seenWalletKeys.add(dedupKey);
            let group = walletGroups.get(row.user_name);
            if (!group) {
                group = { merchant_name: row.user_name, wallets: [] };
                walletGroups.set(row.user_name, group);
            }
            group.wallets.push({
                currency: row.currency,
                balance: row.balance,
            });
        }

        return res.sendResponse(
            {
                merchantBalances: merchantBankBalances,
                walletBalances: Array.from(walletGroups.values()),
            },
            res.__("119") || "Balances fetched successfully.",
            119,
        );
    } catch (error) {
        return res.handleError(error);
    }
};
