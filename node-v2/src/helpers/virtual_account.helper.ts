import { Op, WhereOptions } from "sequelize";
import Merchant from "../models/merchant.model";
import MerchantSetting from "../models/merchant_setting.model";
import User from "../models/user.model";
import {
    MERCHANT_TYPE_PAYINCOLLECTION,
    MERCHANT_TYPE_PAYOUT,
    MERCHANT_TYPE_PAYOUTINTEGRATOR,
} from "../utils/constants";

/**
 * Mirror of the legacy getVirtualAccountScope. Integrator-type
 * merchants are pinned to the virtual account configured in their
 * bank_account_id merchant setting (internal primary key); when the
 * setting is missing/invalid the scope matches nothing (id: 0).
 * Everyone else is scoped to their own accounts.
 */
export const getVirtualAccountScope = async (
    user: User,
    merchant?: Merchant | null,
): Promise<WhereOptions> => {
    const effectiveMerchant =
        merchant ||
        (user.merchantId ? await Merchant.findByPk(user.merchantId) : null);

    if (
        effectiveMerchant &&
        (effectiveMerchant.type === MERCHANT_TYPE_PAYOUT ||
            effectiveMerchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
            effectiveMerchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR)
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

        // No configured bank_account_id -> match nothing.
        return { id: 0 };
    }

    return { userId: user.id };
};
