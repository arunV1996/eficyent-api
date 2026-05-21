import { prisma } from "../../db/prisma";
import { BUSINESS_MODEL_MTO } from "../../helpers/constants";

/**
 * Resolves the business model for a given merchant.
 * Mirror of Laravel's business_model logic.
 */
export async function getBusinessModel(merchantId: bigint | null): Promise<string> {
  if (!merchantId) {
    return BUSINESS_MODEL_MTO;
  }

  const setting = await prisma().merchantSetting.findFirst({
    where: {
      merchantId,
      key: "business_model",
    },
  });

  return setting?.value || BUSINESS_MODEL_MTO;
}
