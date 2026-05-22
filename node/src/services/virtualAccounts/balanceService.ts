import { Prisma, User, VirtualAccount, Wallet } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  DEPOSIT_TRANSACTION_COMPLETED,
  MORPH_VIRTUAL_ACCOUNT,
  TRANSACTION_TYPE_CREDIT,
  TRANSACTION_TYPE_DEBIT,
  WALLET_TRANSACTION_COMPLETED,
} from "../../helpers/constants";

const ZERO = new Prisma.Decimal(0);

/**
 * Mirror of Helper::bankBalance for VirtualAccount (Phase 5: complete).
 *
 *   balance =
 *       sum(deposit_transactions.total_amount where va_id=X & status=COMPLETED)
 *     - sum(beneficiary_transactions.total_amount where va_id=X)        (direct)
 *     - sum(beneficiary_transactions.total_amount where quote.source=va) (via quote)
 *     - sum(quote.total_sending_amount where wallet_transaction.type=CREDIT
 *           and quote.source=va)                                          (wallet credits)
 *
 * The PAYINCOLLECTION variant scopes deposit credits by user.memo - matching
 * the original Laravel branch exactly.
 */
export async function computeBankBalance(
  user: User,
  virtualAccount: VirtualAccount,
): Promise<Prisma.Decimal> {
  // Scope deposit credits by memo when the user is a PAYINCOLLECTION
  // sub-account (mirror of the bankBalance branch in Helper.php).
  let payinCollection = false;
  if (user.merchantId) {
    const merchant = await prisma().merchant.findFirst({
      where: { id: user.merchantId },
    });
    if (merchant?.type === 4 /* MERCHANT_TYPE_PAYINCOLLECTION */) {
      payinCollection = true;
    }
  }

  const depositWhere: Prisma.DepositTransactionWhereInput = {
    userId: user.id,
    virtualAccountId: virtualAccount.id,
    status: DEPOSIT_TRANSACTION_COMPLETED,
    ...(payinCollection && user.memo ? { memo: user.memo } : {}),
  };

  const [depositAgg, quotes] = await Promise.all([
    prisma().depositTransaction.aggregate({
      where: depositWhere,
      _sum: { totalAmount: true },
    }),
    prisma().quote.findMany({
      where: { sourceType: MORPH_VIRTUAL_ACCOUNT, sourceId: virtualAccount.id },
      select: { id: true, totalSendingAmount: true },
    }),
  ]);

  let payouts = ZERO;
  let walletCredits = ZERO;
  if (quotes.length > 0) {
    const quoteIds = quotes.map((q) => q.id);
    const payoutAgg = await prisma().beneficiaryTransaction.aggregate({
      where: { userId: user.id, quoteId: { in: quoteIds } },
      _sum: { totalAmount: true },
    });
    payouts = payoutAgg._sum.totalAmount ?? ZERO;

    const credits = await prisma().walletTransaction.findMany({
      where: {
        userId: user.id,
        quoteId: { in: quoteIds },
        type: TRANSACTION_TYPE_CREDIT,
      },
      select: { quoteId: true },
    });
    for (const wt of credits) {
      const q = quotes.find((qq) => qq.id === wt.quoteId);
      if (q?.totalSendingAmount) {
        walletCredits = walletCredits.plus(q.totalSendingAmount);
      }
    }
  }

  return (depositAgg._sum.totalAmount ?? ZERO)
    .minus(payouts)
    .minus(walletCredits);
}

/**
 * Mirror of Helper::getWalletBalance.
 */
export async function getWalletBalance(
  user: User,
  wallet: Wallet,
): Promise<Prisma.Decimal> {
  const [creditAgg, debitAgg] = await Promise.all([
    prisma().walletTransaction.aggregate({
      where: {
        userId: user.id,
        walletId: wallet.id,
        type: TRANSACTION_TYPE_CREDIT,
        status: WALLET_TRANSACTION_COMPLETED,
      },
      _sum: { totalAmount: true },
    }),
    prisma().walletTransaction.aggregate({
      where: { userId: user.id, walletId: wallet.id, type: TRANSACTION_TYPE_DEBIT },
      _sum: { totalAmount: true },
    }),
  ]);
  return (creditAgg._sum.totalAmount ?? ZERO).minus(
    debitAgg._sum.totalAmount ?? ZERO,
  );
}
