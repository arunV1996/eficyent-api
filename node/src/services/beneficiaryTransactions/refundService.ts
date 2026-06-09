import { BeneficiaryTransaction, Prisma } from "@prisma/client";
import { computeBankBalance } from "../virtualAccounts/balanceService";
import { prisma } from "../../db/prisma";
import {
  DEPOSIT_TRANSACTION_COMPLETED,
  DEPOSIT_TYPE_REFUND,
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_DEPOSIT_TRANSACTION,
  MORPH_VIRTUAL_ACCOUNT,
  MORPH_WALLET,
  MORPH_WALLET_TRANSACTION,
  TRANSACTION_TYPE_CREDIT,
  WALLET_TRANSACTION_COMPLETED,
} from "../../helpers/constants";
import { uniqueId } from "../../helpers/uniqueId";
import { logger } from "../../helpers/logger";

/**
 * Mirror of Helper::create_refund. When a beneficiary transaction is
 * cancelled or rejected, we have to put the money back into the source:
 *
 *   - Wallet source -> credit WalletTransaction (no external call needed)
 *   - VirtualAccount source -> credit DepositTransaction with type=REFUND
 *
 * In both cases we also write a Ledger row chained to the original via
 * `refund_ledger_id`, so the audit trail is queryable both ways.
 *
 * Idempotency: the function is safe to call repeatedly; the first call
 * writes the chain and subsequent calls find an existing
 * `refund_ledger_id == originalLedger.id` row and short-circuit.
 */
export async function createRefund(
  txn: BeneficiaryTransaction,
): Promise<boolean> {
  // The original ledger row for this transaction (written at create time
  // by Helper::updateLedger). If absent there's nothing to refund.
  const originalLedger = await prisma().ledger.findFirst({
    where: {
      transactionType: MORPH_BENEFICIARY_TRANSACTION,
      transactionId: txn.id,
    },
  });
  if (!originalLedger) return false;

  // Has this refund already been processed?
  const existingRefund = await prisma().ledger.findFirst({
    where: { refundLedgerId: originalLedger.id },
  });
  if (existingRefund) return false;

  if (!txn.quoteId) return false;
  const quote = await prisma().quote.findUnique({ where: { id: txn.quoteId } });
  if (!quote || !quote.sourceType || !quote.sourceId) return false;

  await prisma().$transaction(async (tx) => {
    if (quote.sourceType === MORPH_WALLET) {
      const wallet = await tx.wallet.findFirst({
        where: { id: quote.sourceId!, userId: txn.userId },
      });
      if (!wallet) return;

      // Sum existing wallet credits/debits for balance_before/after.
      const [creditAgg, debitAgg] = await Promise.all([
        tx.walletTransaction.aggregate({
          where: {
            walletId: wallet.id,
            userId: txn.userId,
            type: TRANSACTION_TYPE_CREDIT,
          },
          _sum: { totalAmount: true },
        }),
        tx.walletTransaction.aggregate({
          where: {
            walletId: wallet.id,
            userId: txn.userId,
            type: 1, // TRANSACTION_TYPE_DEBIT
          },
          _sum: { totalAmount: true },
        }),
      ]);
      const balance = (creditAgg._sum.totalAmount ?? new Prisma.Decimal(0)).minus(
        debitAgg._sum.totalAmount ?? new Prisma.Decimal(0),
      );
      const refundWt = await tx.walletTransaction.create({
        data: {
          uniqueId: uniqueId(24),
          userId: txn.userId,
          walletId: wallet.id,
          quoteId: quote.id,
          beneficiaryTransactionId: txn.id,
          amount: txn.totalAmount,
          totalAmount: txn.totalAmount,
          fees: new Prisma.Decimal(0),
          status: WALLET_TRANSACTION_COMPLETED,
          type: TRANSACTION_TYPE_CREDIT,
          balanceBefore: balance,
          balanceAfter: balance.plus(txn.totalAmount),
        },
      });
      await tx.ledger.create({
        data: {
          uniqueId: uniqueId(24),
          userId: txn.userId,
          walletId: wallet.id,
          virtualAccountId: null,
          transactionType: MORPH_WALLET_TRANSACTION,
          transactionId: refundWt.id,
          balance: balance.plus(txn.totalAmount),
          externalType: txn.externalType ?? null,
          description: `Refund for ${txn.uniqueId}`,
          refundLedgerId: originalLedger.id,
        },
      });
      return;
    }

    if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
      const va = await tx.virtualAccount.findUnique({
        where: { id: quote.sourceId! },
      });
      if (!va) return;
      const refundDeposit = await tx.depositTransaction.create({
        data: {
          uniqueId: uniqueId(24),
          userId: txn.userId,
          teamMemberId: txn.teamMemberId,
          virtualAccountId: va.id,
          amount: txn.totalAmount,
          totalAmount: txn.totalAmount,
          status: DEPOSIT_TRANSACTION_COMPLETED,
          type: DEPOSIT_TYPE_REFUND,
        },
      });

      let teamMemberContext: { role: number; id: bigint } | null = null;
      if (txn.teamMemberId) {
        const tm = await tx.teamMember.findUnique({
          where: { id: txn.teamMemberId },
        });
        if (tm) {
          teamMemberContext = { role: tm.role, id: tm.id };
        }
      }

      const freshBalance = await computeBankBalance(
        { id: txn.userId } as any,
        va,
        teamMemberContext,
      );

      await tx.ledger.create({
        data: {
          uniqueId: uniqueId(24),
          userId: txn.userId,
          virtualAccountId: va.id,
          walletId: null,
          transactionType: MORPH_DEPOSIT_TRANSACTION,
          transactionId: refundDeposit.id,
          balance: freshBalance,
          externalType: txn.externalType ?? null,
          description: `Refund for ${txn.uniqueId}`,
          refundLedgerId: originalLedger.id,
        },
      });
    }
  });

  logger.info(
    { txnId: txn.uniqueId, userId: txn.userId.toString() },
    "Refund chain created",
  );
  return true;
}

export async function reverseRefund(
  txn: BeneficiaryTransaction,
): Promise<boolean> {
  const originalLedger = await prisma().ledger.findFirst({
    where: {
      transactionType: MORPH_BENEFICIARY_TRANSACTION,
      transactionId: txn.id,
    },
  });
  if (!originalLedger) return false;

  const refundLedger = await prisma().ledger.findFirst({
    where: { refundLedgerId: originalLedger.id },
  });
  if (!refundLedger) return false;

  await prisma().$transaction(async (tx) => {
    if (refundLedger.transactionId) {
      if (refundLedger.transactionType === MORPH_WALLET_TRANSACTION) {
        await tx.walletTransaction.delete({
          where: { id: refundLedger.transactionId },
        });
      } else if (refundLedger.transactionType === MORPH_DEPOSIT_TRANSACTION) {
        await tx.depositTransaction.delete({
          where: { id: refundLedger.transactionId },
        });
      }
    }
    await tx.ledger.delete({
      where: { id: refundLedger.id },
    });
  });

  logger.info(
    { txnId: txn.uniqueId, userId: txn.userId.toString() },
    "Refund chain reversed (deleted)",
  );
  return true;
}
