import { Op, WhereOptions } from "sequelize";
import Merchant from "../models/merchant.model";
import MerchantSetting from "../models/merchant_setting.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import {
    MERCHANT_TYPE_PAYINCOLLECTION,
    MERCHANT_TYPE_PAYOUT,
    MERCHANT_TYPE_PAYOUTINTEGRATOR,
} from "../utils/constants";

/**
 * Mirror of the legacy VirtualAccount::forUser scope. Integrator
 * merchants with accounts linked directly to their user override the
 * merchant setting; PAYOUT/PAYINCOLLECTION/PAYOUTINTEGRATOR merchants
 * otherwise resolve the bank_account_id merchant setting (one id or a
 * comma-separated list), falling back to the default pool accounts
 * (user_id IS NULL). Everyone else is scoped to their own accounts.
 */
export const getVirtualAccountScope = async (
    user: User,
    merchant?: Merchant | null,
): Promise<WhereOptions> => {
    const effectiveMerchant =
        merchant ||
        (user.merchantId ? await Merchant.findByPk(user.merchantId) : null);

    if (effectiveMerchant) {
        if (effectiveMerchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR) {
            // Laravel behavior: Integrators can have accounts linked
            // directly to their user_id. If any exist, they override the
            // merchant setting.
            const userBankAccounts = await VirtualAccount.count({
                where: { userId: user.id },
            });
            if (userBankAccounts > 0) {
                return { userId: user.id };
            }
        }
        if (
            effectiveMerchant.type === MERCHANT_TYPE_PAYOUT ||
            effectiveMerchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
            effectiveMerchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR
        ) {
            const bankAccountSetting = await MerchantSetting.findOne({
                where: {
                    merchantId: effectiveMerchant.id,
                    key: "bank_account_id",
                },
            });
            if (bankAccountSetting?.value) {
                // The setting may carry one id or a comma-separated list.
                const rawValues = String(bankAccountSetting.value).split(",");
                const ids = rawValues
                    .map((v) => Number(v.trim()))
                    .filter((v) => Number.isFinite(v) && v > 0);
                if (ids.length === 1) {
                    return { id: ids[0] };
                } else if (ids.length > 1) {
                    return { id: { [Op.in]: ids } };
                }
            }
            // No configured bank_account_id -> fallback to default pool
            // accounts.
            return { userId: null };
        }
    }

    return { userId: user.id };
};
