import { Prisma, User, Merchant } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  MERCHANT_TYPE_PAYINCOLLECTION,
  MERCHANT_TYPE_PAYOUT,
  MERCHANT_TYPE_PAYOUTINTEGRATOR,
} from "../../helpers/constants";

/**
 * Mirror of VirtualAccount::scopeForUser.
 *
 * Implements the decentralized funding logic:
 *   - For Standard Users: match by userId.
 *   - For Payout/PayinCollection/Integrator Merchants: prioritises the
 *     designated 'bank_account_id' from merchant settings. If setting is
 *     missing, it filters for global accounts (user_id IS NULL).
 */
export async function getVirtualAccountScope(
  user: User,
  merchant?: Merchant | null,
): Promise<Prisma.VirtualAccountWhereInput> {
  // Resolve merchant if not already provided (mimics Laravel's $user->merchant check)
  const effectiveMerchant =
    merchant ||
    (user.merchantId
      ? await prisma().merchant.findFirst({ where: { id: user.merchantId } })
      : null);

  if (
    effectiveMerchant &&
    (effectiveMerchant.type === MERCHANT_TYPE_PAYOUT ||
      effectiveMerchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
      effectiveMerchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR)
  ) {
    const setting = await prisma().merchantSetting.findFirst({
      where: { merchantId: effectiveMerchant.id, key: "bank_account_id" },
    });

    if (setting?.value) {
      // bank_account_id in settings refers to the internal primary key (BigInt)
      try {
        const bankAccountId = BigInt(setting.value);
        return { id: bankAccountId };
      } catch {
        // Fall through to null if invalid ID
      }
    }

    return { userId: null };
  }

  return { userId: user.id };
}
