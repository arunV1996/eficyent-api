import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { prisma } from "../../db/prisma";
import {
  generateTransactionRefNumber,
  uniqueId,
} from "../../helpers/uniqueId";
import {
  ACTION_BY_TEAM,
  ACTION_BY_USER,
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  PAYOUT_JOB_STATUS_PENDING,
  TRANSACTION_MODE_DIRECT,
} from "../../helpers/constants";
import { Dispatch } from "../../queues/dispatchers";
import { PayoutStoreInput } from "../../validators/payout/payoutValidators";

/**
 * Reference conversion of BeneficiaryTransactionController::store.
 *
 * Flow (preserves the Laravel logic):
 *   1. Idempotency middleware has already validated the Idempotency-Key
 *      header and is recording the response.
 *   2. Verify the beneficiary account belongs to the user and is active.
 *   3. Insert the BeneficiaryTransaction in a single transaction.
 *   4. Insert a PayoutJob audit row.
 *   5. Dispatch a BullMQ Payout job (jobId scoped to the transaction id so
 *      duplicate enqueues collapse).
 *   6. Return 201 with the created transaction envelope.
 *
 * Status assignment mirrors the original:
 *   - default: WAITING_FOR_APPROVAL (0)
 *   - team member acting under maker/checker: CORPORATE_INITIATED (9)
 *   - direct mode (transaction_mode=DIRECT): APPROVED (1) -> queued
 */

export const payoutController = {
  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(401, undefined, 401);
    const user = req.user;
    const body = req.body as PayoutStoreInput;

    const beneficiary = await prisma().beneficiaryAccount.findFirst({
      where: {
        uniqueId: body.beneficiary_account_id,
        userId: user.id,
        deletedAt: null,
      },
    });
    if (!beneficiary) throw new ApiException(404, "Beneficiary not found.", 404);

    // Resolve transaction mode. In Phase 1 this is read from app settings,
    // defaulting to APPROVAL. When the Settings module is ported, replace
    // this with the same Setting::get('transaction_mode') call.
    const transactionMode = TRANSACTION_MODE_DIRECT; // TODO: read from settings table.
    const initialStatus =
      transactionMode === TRANSACTION_MODE_DIRECT
        ? BENEFICIARY_TRANSACTION_APPROVED
        : BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;

    const txn = await prisma().$transaction(async (tx) => {
      const created = await tx.beneficiaryTransaction.create({
        data: {
          uniqueId: uniqueId(24),
          txnRefNo: generateTransactionRefNumber(
            user.merchantId ? Number(user.merchantId) : Number(user.id),
          ),
          userId: user.id,
          beneficiaryAccountId: beneficiary.id,
          senderId: BigInt(body.sender_id),
          quoteId: BigInt(body.quote_id),
          amount: new Prisma.Decimal(body.amount),
          totalAmount: new Prisma.Decimal(body.amount),
          currency: body.currency,
          paymentRail: body.payment_rail ?? null,
          paymentMethod: body.payment_method ?? null,
          purposeOfTransaction: body.purpose_of_transaction,
          sourceOfFunds: body.source_of_funds,
          remarks: body.remarks ?? null,
          status: initialStatus,
        },
      });

      await tx.beneficiaryTransactionStatusHistory.create({
        data: {
          beneficiaryTransactionId: created.id,
          fromStatus: null,
          toStatus: initialStatus,
          actionBy: req.user?.businessUserId ? ACTION_BY_TEAM : ACTION_BY_USER,
          actorId: user.id,
        },
      });

      // Always record a PayoutJob row, even when status is WAITING - this is
      // the durable handle the API uses for retries and ops dashboards.
      const payoutJob = await tx.payoutJob.create({
        data: {
          jobUniqueId: uniqueId(24),
          beneficiaryTransactionId: created.id,
          userId: user.id,
          status: PAYOUT_JOB_STATUS_PENDING,
          payload: {
            beneficiaryAccountId: beneficiary.id.toString(),
            quoteId: body.quote_id,
            amount: body.amount,
            currency: body.currency,
          },
        },
      });

      return { created, payoutJob };
    });

    // Only dispatch when the transaction is in a queueable state. The worker
    // also enforces this; double-checking here avoids a useless job.
    if (
      initialStatus === BENEFICIARY_TRANSACTION_APPROVED ||
      initialStatus === BENEFICIARY_TRANSACTION_INITIATED ||
      initialStatus === BENEFICIARY_TRANSACTION_CORPORATE_INITIATED
    ) {
      await Dispatch.payout({
        beneficiaryTransactionId: txn.created.id.toString(),
        payoutJobId: txn.payoutJob.jobUniqueId,
        userId: user.id.toString(),
        source: "approval",
      });
    }

    return sendResponse(
      res,
      "Payout request accepted.",
      202,
      {
        transaction: {
          id: txn.created.id.toString(),
          unique_id: txn.created.uniqueId,
          txn_ref_no: txn.created.txnRefNo,
          status: txn.created.status,
          amount: txn.created.amount.toString(),
          currency: txn.created.currency,
          created_at: txn.created.createdAt.toISOString(),
        },
        payout_job: {
          id: txn.payoutJob.jobUniqueId,
          status: txn.payoutJob.status,
        },
      },
      202,
    );
  },
};
