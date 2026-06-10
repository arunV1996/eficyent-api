import { BeneficiaryTransaction, Prisma, User } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import {
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_CANCELLED,
  BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_REJECTED,
  BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  MERCHANT_TYPE_PAYOUT,
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_VIRTUAL_ACCOUNT,
  MORPH_WALLET,
  PAYOUT_JOB_STATUS_PENDING,
  QUOTE_SUBMITTED,
  SENDER_STATUS_DISABLED,
  TEAM_MEMBER_PERMISSION_MAKER,
  TEAM_MEMBER_ROLE_CORPORATE,
  TEAM_MEMBER_ROLE_SUPPORT_MEMBER,
  TRANSACTION_TYPE_DEBIT,
  WALLET_STATUS_ACTIVE,
  WALLET_TRANSACTION_COMPLETED,
} from "../../helpers/constants";
import {
  computeBankBalance,
  getWalletBalance,
} from "../virtualAccounts/balanceService";
import {
  getVirtualAccountScope,
} from "../virtualAccounts/virtualAccountService";
import { uniqueId, generateTransactionRefNumber } from "../../helpers/uniqueId";
import { Dispatch } from "../../queues/dispatchers";
import { createRefund } from "./refundService";
import { logger } from "../../helpers/logger";

const ZERO = new Prisma.Decimal(0);

/**
 * Mirror of App\\Repositories\\BeneficiaryTransactionRepository.
 * Pure-domain helpers; controllers compose them.
 */

export interface PayoutCreatePayload {
  beneficiary_account_id: string;
  quote_id: string;
  remitter_id?: string;
  remarks?: string;
  supporting_document?: string;
  txn_ref_no?: string;
  purpose_of_payment?: string;
  client_reference_id?: string;
}

interface CreatorContext {
  id: bigint;
  role: number;
  permission?: number;
  senderId: bigint | null;
}

/**
 * Mirror of Helper::is_remitter_deposit_enabled.
 * Returns true only when the user belongs to a PAYOUT-type merchant
 * that has the 'enable_remitter_deposit' setting set to '1'.
 * When true, the balance gate in createPayoutTransaction is bypassed.
 */
async function isRemitterDepositEnabled(merchantId: bigint | null): Promise<boolean> {
  if (!merchantId) return false;
  const merchant = await prisma().merchant.findFirst({ where: { id: merchantId } });
  if (!merchant || merchant.type !== MERCHANT_TYPE_PAYOUT) return false;
  const setting = await prisma().merchantSetting.findFirst({
    where: { merchantId: merchant.id, key: "enable_remitter_deposit" },
  });
  return setting?.value === "1";
}

/**
 * Mirror of BeneficiaryTransactionRepository::create.
 * Returns the created BeneficiaryTransaction (with the related quote +
 * beneficiary account + sender eagerly loaded for the resource shaper).
 */
export async function createPayoutTransaction(
  payload: PayoutCreatePayload,
  user: User,
  creator: CreatorContext | null = null,
): Promise<BeneficiaryTransaction> {
  if (payload.client_reference_id) {
    const dup = await prisma().beneficiaryTransaction.findFirst({
      where: {
        userId: user.id,
        clientReferenceId: payload.client_reference_id,
      },
    });
    if (dup) throw new ApiException(187);
  }

  let finalStatus = BENEFICIARY_TRANSACTION_APPROVED;
  let resolvedSenderId: bigint | null = null;
  if (creator) {
    if (creator.role === TEAM_MEMBER_ROLE_SUPPORT_MEMBER) {
      finalStatus = BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;
    }
    if (creator.role === TEAM_MEMBER_ROLE_CORPORATE) {
      finalStatus = BENEFICIARY_TRANSACTION_CORPORATE_INITIATED;
      if (!creator.senderId) throw new ApiException(132);
      resolvedSenderId = creator.senderId;
    }
  }

  const quote = await prisma().quote.findFirst({
    where: { uniqueId: payload.quote_id, userId: user.id },
  });
  if (!quote) throw new ApiException(121);
  if (quote.status === QUOTE_SUBMITTED) throw new ApiException(153);

  const beneficiaryAccount = await prisma().beneficiaryAccount.findFirst({
    where: { uniqueId: payload.beneficiary_account_id, userId: user.id },
  });
  if (!beneficiaryAccount) throw new ApiException(118);
  if (
    beneficiaryAccount.currency &&
    quote.receivingCurrency &&
    beneficiaryAccount.currency !== quote.receivingCurrency
  ) {
    throw new ApiException(180);
  }

  // Source validation happens here, but balance computation and locking 
  // is deferred until inside the transaction to prevent race conditions.
  if (!quote.sourceType || !quote.sourceId) throw new ApiException(120);
  let va: any = null;
  let wallet: any = null;

  if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
    const baseScope = await getVirtualAccountScope(user);
    va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, id: quote.sourceId },
    });
    if (!va) throw new ApiException(120);
  } else if (quote.sourceType === MORPH_WALLET) {
    wallet = await prisma().wallet.findFirst({
      where: { id: quote.sourceId, userId: user.id },
    });
    if (!wallet) throw new ApiException(120);
    if (wallet.status !== WALLET_STATUS_ACTIVE) throw new ApiException(169);
  } else {
    throw new ApiException(120);
  }

  // Resolve sender (when provided).
  if (payload.remitter_id) {
    if (!user.enableSender) throw new ApiException(143);
    const sender = await prisma().sender.findFirst({
      where: { uniqueId: payload.remitter_id, userId: user.id, deletedAt: null },
    });
    if (!sender) throw new ApiException(132);
    if (sender.status === SENDER_STATUS_DISABLED) throw new ApiException(203);
    if (
      beneficiaryAccount.currency === "PKR" &&
      sender.nationality === "IND"
    ) {
      throw new ApiException(200);
    }
    resolvedSenderId = sender.id;
  }

  // Balance gate check logic moved inside the transaction block below

  const fees = quote.commissionAmount
    .plus(quote.externalCommissionAmount)
// @ts-ignore - Catch-all auto-fix for: Argument of type 'Decimal | nu...
    .plus(quote.merchantCommissionAmount);

  // Reference number: prefer client-supplied, fall back to generated.
  let txnRefNo: string;
  if (payload.txn_ref_no) {
    const existing = await prisma().beneficiaryTransaction.findFirst({
      where: { txnRefNo: payload.txn_ref_no },
    });
    if (existing) throw new ApiException(196);
    txnRefNo = payload.txn_ref_no;
  } else {
    txnRefNo = generateTransactionRefNumber(
      user.merchantId ? Number(user.merchantId) : Number(user.id),
    );
  }

  const remitterDepositEnabled = await isRemitterDepositEnabled(user.merchantId ?? null);

  const created = await prisma().$transaction(async (tx) => {
    // 1. Pessimistic Lock & Balance Check
    let txCheckBalance = ZERO;
    
    if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
      await tx.$queryRaw`SELECT id FROM virtual_accounts WHERE id = ${va.id} FOR UPDATE`;
      txCheckBalance = await computeBankBalance(user, va, creator ? { role: creator.role, id: creator.id } : null);
    } else if (quote.sourceType === MORPH_WALLET) {
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
      txCheckBalance = await getWalletBalance(user, wallet);
    }

    if (!remitterDepositEnabled && txCheckBalance.lt(quote.amount)) {
      throw new ApiException(154);
    }
    const txn = await tx.beneficiaryTransaction.create({
      data: {
        uniqueId: uniqueId(24),
        txnRefNo,
        userId: user.id,
        teamMemberId: creator?.id ?? null,
        senderId: resolvedSenderId,
        quoteId: quote.id,
        beneficiaryAccountId: beneficiaryAccount.id,
        amount: quote.amount,
        commissionAmount: fees,
        totalAmount: quote.amount.plus(fees),
        recipientAmount: quote.receivingAmount,
        receivingCurrency: quote.receivingCurrency,
        externalType: quote.externalType,
        rail: quote.paymentRail,
        purposeOfPayment: payload.purpose_of_payment ?? null,
        supportingDocument: payload.supporting_document ?? null,
        remarks: payload.remarks ?? null,
        clientReferenceId: payload.client_reference_id ?? null,
        orderId: `TXN${Math.floor(Date.now() / 1000).toString().slice(-8)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        status: finalStatus,
      },
    });

    await tx.beneficiaryTransactionStatusHistory.create({
      data: {
        uniqueId: uniqueId(24),
        beneficiaryTransactionId: txn.id,
        fromStatus: null,
        toStatus: String(finalStatus),
        changedBy: creator ? creator.id.toString() : user.id.toString(),
        changedByType: creator ? "team" : "user",
        changedAt: new Date(),
      },
    });

    // Mark the quote as submitted - prevents re-use.
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: QUOTE_SUBMITTED },
    });

    // Ledger: write a debit anchor row tied to this transaction. The
    // refund chain (createRefund) finds this row by transactionType +
    // transactionId.
    await tx.ledger.create({
      data: {
        uniqueId: uniqueId(24),
        userId: user.id,
        virtualAccountId:
          quote.sourceType === MORPH_VIRTUAL_ACCOUNT ? quote.sourceId : null,
        walletId: quote.sourceType === MORPH_WALLET ? quote.sourceId : null,
        transactionType: MORPH_BENEFICIARY_TRANSACTION,
        transactionId: txn.id,
        balance: txCheckBalance.minus(quote.amount.plus(fees)),
        externalType: quote.externalType,
        description: `Payout ${txn.uniqueId}`,
      },
    });

    if (quote.sourceType === MORPH_WALLET) {
      await tx.walletTransaction.create({
        data: {
          uniqueId: uniqueId(24),
          userId: user.id,
          walletId: quote.sourceId!,
          quoteId: quote.id,
          beneficiaryTransactionId: txn.id,
          // Mirror of Laravel updateLedger: WalletTransaction.amount stores
          // total_amount (base amount + fees), not the base amount alone.
          amount: quote.amount.plus(fees),
          totalAmount: quote.amount.plus(fees),
          fees: fees,
          status: WALLET_TRANSACTION_COMPLETED,
          type: TRANSACTION_TYPE_DEBIT,
          balanceBefore: txCheckBalance,
          balanceAfter: txCheckBalance.minus(quote.amount.plus(fees)),
        },
      });
    }

    // Audit row - PayoutJob is the durable handle the API uses for
    // retries and ops dashboards.
    const payoutJob = await tx.payoutJob.create({
      data: {
        uniqueId: uniqueId(24),
        userId: user.id,
        beneficiaryTransactionId: txn.id,
        amount: quote.amount.plus(fees),
        status: PAYOUT_JOB_STATUS_PENDING,
        payload: {
          beneficiaryAccountId: beneficiaryAccount.id.toString(),
          quoteId: quote.uniqueId,
          amount: quote.amount.toString(),
          currency: quote.receivingCurrency,
        },
      },
    });

    return { txn, payoutJob };
  });

  // Dispatch when the transaction is in a queueable state.
  // NOTE: CORPORATE_INITIATED is intentionally excluded — the payout must not
  // be dispatched until a checker approves it (mirrors Laravel's
  // Helper::processTransaction which gates on BENEFICIARY_TRANSACTION_APPROVED).
  if (
    finalStatus === BENEFICIARY_TRANSACTION_APPROVED ||
    finalStatus === BENEFICIARY_TRANSACTION_INITIATED
  ) {
    await Dispatch.payout({
      beneficiaryTransactionId: created.txn.id.toString(),
      payoutJobUniqueId: created.payoutJob.uniqueId,
      userId: user.id.toString(),
      source: "approval",
    });
  }

  const { TelegramNotifier } = await import("../external/telegram");
  void TelegramNotifier.notifyBeneficiaryTransaction(created.txn.id);

  return prisma().beneficiaryTransaction.findUniqueOrThrow({
    where: { id: created.txn.id },
    include: {
      beneficiaryAccount: {
        include: { additionalDetails: true },
      },
      quotes: true,
      senders: {
        include: { documents: true },
      },
      team_members: true,
      users: true,
      proofs: true,
    },
  });
}

/**
 * Mirror of BeneficiaryTransactionRepository::cancel.
 */
export async function cancelTransactions(
  user: User,
  uniqueIds: string[],
  remarks?: string,
): Promise<{
  updated_count: number;
  failed_count: number;
  success_transactions: { unique_id: string }[];
  failed_transactions: { unique_id: string; message: string }[];
}> {
  const success: { unique_id: string }[] = [];
  const failed: { unique_id: string; message: string }[] = [];
  for (const uid of uniqueIds) {
    try {
      const updated = await prisma().$transaction(async (tx) => {
        const txn = await tx.beneficiaryTransaction.findFirst({
          where: { userId: user.id, uniqueId: uid },
        });
        if (!txn) throw new ApiException(124);
        if (txn.status >= BENEFICIARY_TRANSACTION_INITIATED) {
          throw new ApiException(155);
        }
        return tx.beneficiaryTransaction.update({
          where: { id: txn.id },
          data: {
            status: BENEFICIARY_TRANSACTION_CANCELLED,
            notes: remarks ?? null,
          },
        });
      });
      await createRefund(updated);
      success.push({ unique_id: updated.uniqueId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ unique_id: uid, message: msg });
    }
  }
  return {
    updated_count: success.length,
    failed_count: failed.length,
    success_transactions: success,
    failed_transactions: failed,
  };
}

/**
 * Mirror of BeneficiaryTransactionRepository::updateStatus.
 */
export async function updateTransactionStatus(
  user: User,
  uniqueIds: string[],
  status: number,
  remarks?: string,
  teamMember?: { permission: number } | null,
): Promise<{
  updated_count: number;
  failed_count: number;
  success_transactions: { unique_id: string }[];
  failed_transactions: { unique_id: string; message: string }[];
}> {
  const success: { unique_id: string }[] = [];
  const failed: { unique_id: string; message: string }[] = [];
  for (const uid of uniqueIds) {
    try {
      const updated = await prisma().$transaction(async (tx) => {
        const txn = await tx.beneficiaryTransaction.findFirst({
          where: { userId: user.id, uniqueId: uid },
        });
        if (!txn) throw new ApiException(124);

        let resolvedStatus = status;
        if (teamMember && teamMember.permission === TEAM_MEMBER_PERMISSION_MAKER) {
          if (txn.status !== BENEFICIARY_TRANSACTION_CORPORATE_INITIATED) {
            throw new ApiException(162);
          }
          resolvedStatus = BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;
        } else {
          const allowed = [
            BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
            BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
          ];
          if (!allowed.includes(txn.status)) throw new ApiException(162);
        }

        return tx.beneficiaryTransaction.update({
          where: { id: txn.id },
          data: { status: resolvedStatus, notes: remarks ?? null },
        });
      });
      if (status === BENEFICIARY_TRANSACTION_REJECTED) {
        await createRefund(updated);
      } else if (status === BENEFICIARY_TRANSACTION_APPROVED) {
        // Re-dispatch through the payout queue. The PayoutJob row was
        // created at /store time; we just need to reuse it.
        const payoutJob = await prisma().payoutJob.findFirst({
          where: { beneficiaryTransactionId: updated.id },
          orderBy: { id: "desc" },
        });
        if (payoutJob) {
          await Dispatch.payout({
            beneficiaryTransactionId: updated.id.toString(),
            payoutJobUniqueId: payoutJob.uniqueId,
            userId: user.id.toString(),
            source: "approval",
          });
        }
      }
      const { TelegramNotifier } = await import("../external/telegram");
      void TelegramNotifier.notifyBeneficiaryTransaction(updated.id);
      success.push({ unique_id: updated.uniqueId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ unique_id: uid, message: msg });
    }
  }
  return {
    updated_count: success.length,
    failed_count: failed.length,
    success_transactions: success,
    failed_transactions: failed,
  };
}

/**
 * Mirror of the search branch in BeneficiaryTransactionRepository::list.
 * Returns the raw Prisma where-clause - controllers add pagination.
 */
export async function listWhere(
  user: User,
  q: {
    status?: string;
    from_date?: string;
    to_date?: string;
    bank_account_id?: string;
    wallet_id?: string;
    search_key?: string;
  },
  teamMember: { role: number; id: bigint } | null = null,
): Promise<Prisma.BeneficiaryTransactionWhereInput> {
  const { TEAM_MEMBER_ROLE_CORPORATE } = await import("../../helpers/constants");

  const where: Prisma.BeneficiaryTransactionWhereInput = {
    userId: user.id,
  };

  if (teamMember && teamMember.role === TEAM_MEMBER_ROLE_CORPORATE) {
    where.teamMemberId = teamMember.id;
  }

  if (q.status) {
    const {
      BENEFICIARY_TRANSACTION_STATUS_MAP,
      BENEFICIARY_TRANSACTION_PROCESSING,
      BENEFICIARY_TRANSACTION_FAILED,
      BENEFICIARY_TRANSACTION_APPROVED,
      BENEFICIARY_TRANSACTION_INITIATED,
      BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
      BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
      BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
      BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
      BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
      BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
      BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
      BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
      BENEFICIARY_TRANSACTION_EXPIRED,
      BENEFICIARY_TRANSACTION_CANCELLED,
      BENEFICIARY_TRANSACTION_REJECTED,
    } = await import("../../helpers/constants");

    const statusVal = BENEFICIARY_TRANSACTION_STATUS_MAP[q.status];
    if (statusVal !== undefined) {
      if (statusVal === BENEFICIARY_TRANSACTION_PROCESSING) {
        where.status = {
          in: [
            BENEFICIARY_TRANSACTION_APPROVED,
            BENEFICIARY_TRANSACTION_INITIATED,
            BENEFICIARY_TRANSACTION_PROCESSING,
            BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
            BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
            BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
            BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
            BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
            BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
            BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
            BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED,
          ],
        };
      } else if (statusVal === BENEFICIARY_TRANSACTION_FAILED) {
        where.status = {
          in: [
            BENEFICIARY_TRANSACTION_FAILED,
            BENEFICIARY_TRANSACTION_EXPIRED,
            BENEFICIARY_TRANSACTION_CANCELLED,
            BENEFICIARY_TRANSACTION_REJECTED,
          ],
        };
      } else {
        where.status = statusVal;
      }
    }
  }
  if (q.from_date && q.to_date) {
    where.createdAt = {
      gte: new Date(`${q.from_date}T00:00:00Z`),
      lte: new Date(`${q.to_date}T23:59:59Z`),
    };
  }
  if (q.bank_account_id) {
    const baseScope = await getVirtualAccountScope(user);
    const va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, uniqueId: q.bank_account_id },
    });
    if (!va) throw new ApiException(120);
    where.quotes = { sourceId: va.id, sourceType: MORPH_VIRTUAL_ACCOUNT };
  }
  if (q.wallet_id) {
    const wallet = await prisma().wallet.findFirst({
      where: { uniqueId: q.wallet_id, userId: user.id },
    });
    if (!wallet) throw new ApiException(167);
    where.quotes = { sourceId: wallet.id, sourceType: MORPH_WALLET };
  }
  if (q.search_key) {
    const k = q.search_key;
    where.OR = [
      { uniqueId: { contains: k } },
      { txnRefNo: { contains: k } },
      { remarks: { contains: k } },
      { externalReferenceId: { contains: k } },
      {
        beneficiaryAccount: {
          OR: [
            { accountNumber: { contains: k } },
            { bankName: { contains: k } },
            { swiftCode: { contains: k } },
            { routingNumber: { contains: k } },
            { accountName: { contains: k } },
            { firstName: { contains: k } },
            { lastName: { contains: k } },
            { businessName: { contains: k } },
          ],
        },
      },
    ];
  }
  return where;
}

/**
 * Helper to write a status history row from outside the create() flow
 * (e.g. external service callbacks). Exported for Phase 8/9.
 */
export async function recordStatusHistory(
  txnId: bigint,
  fromStatus: number | null,
  toStatus: number,
  changedBy: string,
  changedByType: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await prisma().beneficiaryTransactionStatusHistory.create({
    data: {
      uniqueId: uniqueId(24),
      beneficiaryTransactionId: txnId,
      fromStatus: fromStatus !== null ? String(fromStatus) : null,
      toStatus: String(toStatus),
      changedBy,
      changedByType,
      changedAt: new Date(),
      meta: meta as Prisma.InputJsonValue | undefined,
    },
  });
  logger.debug({ txnId: txnId.toString(), fromStatus, toStatus }, "BT status history");
}
