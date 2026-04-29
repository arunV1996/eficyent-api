import { Prisma, User, VirtualAccount, Wallet } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  MORPH_VIRTUAL_ACCOUNT,
  TRANSACTION_TYPE_CREDIT,
  TRANSACTION_TYPE_DEBIT,
} from "../../helpers/constants";

const ZERO = new Prisma.Decimal(0);

/**
 * Mirror of Helper::bankBalance for VirtualAccount.
 *
 *   balance =
 *     sum(deposit_transactions.total_amount where va_id=X & status=COMPLETED)
 *   - sum(beneficiary_transactions.total_amount where quote.source=va)
 *   - sum(quote.total_sending_amount where wallet_transaction.type=CREDIT
 *         and quote.source=va)
 *
 * DepositTransaction lands in Phase 5; that branch returns 0 until then.
 * The Wallet credit branch (re-enabled now that WalletTransaction is in
 * the schema) is the major Phase-4 addition - this unblocks accurate
 * balance previews for users who have converted any portion of a virtual
 * account balance into a wallet.
 */
export async function computeBankBalance(
  user: User,
  virtualAccount: VirtualAccount,
): Promise<Prisma.Decimal> {
  const quotes = await prisma().quote.findMany({
    where: {
      sourceType: MORPH_VIRTUAL_ACCOUNT,
      sourceId: virtualAccount.id,
    },
    select: { id: true, totalSendingAmount: true },
  });
  const quoteIds = quotes.map((q) => q.id);

  const debits = await prisma().beneficiaryTransaction.aggregate({
    where: { userId: user.id, virtualAccountId: virtualAccount.id },
    _sum: { totalAmount: true },
  });
  const directDebits = debits._sum.totalAmount ?? ZERO;

  let payouts = ZERO;
  let walletCredits = ZERO;
  if (quoteIds.length > 0) {
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

  // TODO Phase 5: subtract direct deposit credits (deposit_transactions)
  return ZERO.minus(directDebits).minus(payouts).minus(walletCredits);
}

/**
 * Mirror of Helper::getWalletBalance.
 *   credits  = sum(wallet_transactions.total_amount where type=CREDIT)
 *   debits   = sum(wallet_transactions.total_amount where type=DEBIT)
 *   balance  = credits - debits
 */
export async function getWalletBalance(
  user: User,
  wallet: Wallet,
): Promise<Prisma.Decimal> {
  const [creditAgg, debitAgg] = await Promise.all([
    prisma().walletTransaction.aggregate({
      where: { userId: user.id, walletId: wallet.id, type: TRANSACTION_TYPE_CREDIT },
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
