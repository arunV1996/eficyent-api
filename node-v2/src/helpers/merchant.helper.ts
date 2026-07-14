import MerchantSetting from "../models/merchant_setting.model";
import { BUSINESS_MODEL_MTO } from "../utils/constants";

/**
 * Resolves the business model for a merchant from its
 * merchant_settings row, defaulting to "mto". Mirror of the legacy
 * merchantService.getBusinessModel.
 */
export const getBusinessModel = async (
    merchantId: number | null,
): Promise<string> => {
    if (!merchantId) {
        return BUSINESS_MODEL_MTO;
    }

    const businessModelSetting = await MerchantSetting.findOne({
        where: {
            merchantId,
            key: "business_model",
        },
    });

    return businessModelSetting?.value || BUSINESS_MODEL_MTO;
};
