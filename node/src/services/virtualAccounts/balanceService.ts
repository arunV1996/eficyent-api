import { Prisma, User, VirtualAccount } from "@prisma/client";
import { prisma } from "../../db/prisma";

/**
 * Mirror of Helper::bankBalance.
 *
 * The full computation is:
 *   balance = sum(deposit_transactions.total_amount where va_id=X & status=COMPLETED)
 *           - sum(beneficiary_transactions.total_amount where quote.source=va)
 *           - sum(wallet_transactions.quote.total_sending_amount where quote.source=va & type=CREDIT)
 *
 * Quote / DepositTransaction / WalletTransaction tables land in Phases 4-5.
 * For Phase 3 we compute the partial balance using only what's available
 * (beneficiary_transactions linked via virtual_account_id directly), which
 * gives a useful preview for accounts whose deposits and wallet activity
 * are not yet relevant.
 *
 * Returns a Prisma.Decimal so the caller controls formatting.
 */
export async function computeBankBalance(
  user: User,
  virtualAccount: VirtualAccount,
): Promise<Prisma.Decimal> {
  const debits = await prisma().beneficiaryTransaction.aggregate({
    where: { userId: user.id, virtualAccountId: virtualAccount.id },
    _sum: { totalAmount: true },
  });
  const debit = debits._sum.totalAmount ?? new Prisma.Decimal(0);
  return new Prisma.Decimal(0).minus(debit);
}
