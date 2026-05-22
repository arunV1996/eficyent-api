import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_COMPLETED,
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  CALLBACK_PAYOUT_REJECTED,
  CALLBACK_PAYOUT_SUCCESS,
  DEPOSIT_TRANSACTION_COMPLETED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  EXTERNAL_CALL_FOR_CALLBACK,
  EXTERNAL_TYPE_PROCESSING_UNIT,
  MORPH_BENEFICIARY_TRANSACTION,
  MORPH_DEPOSIT_TRANSACTION,
} from "../../helpers/constants";
import {
  mapProcessingUnitDepositStatus,
  mapProcessingUnitServiceToExternalType,
  mapProcessingUnitWithdrawStatus,
} from "../../services/processingUnit/statusMap";
import { Dispatch } from "../../queues/dispatchers";
import { createRefund } from "../../services/beneficiaryTransactions/refundService";
import { beneficiaryTransactionCallbackPayload } from "../../services/callbacks/payloadBuilders";
import { uniqueId } from "../../helpers/uniqueId";

/**
 * Mirror of App\\Http\\Controllers\\Api\\Callbacks\\ProcessingUnitWebhookController.
 *
 * Two modules:
 *   - "withdraw" -> updates BeneficiaryTransaction (with order_id keying),
 *     fires merchant callback (PAYOUT_SUCCESS / PAYOUT_REJECTED),
 *     enqueues SendDebitNotification on COMPLETED, runs createRefund on
 *     FAILED transitions (skipping if old status was already FAILED).
 *   - "deposit" -> updates DepositTransaction, writes a credit ledger
 *     row when the deposit lands (mirror of Helper::updateLedger).
 *
 * Always returns 200 - any 4xx/5xx would prompt PU to retry.
 */
export const processingUnitWebhookController = {
  async invoke(req: Request, res: Response): Promise<Response> {
    const start = Date.now();
    const data = (req.body ?? {}) as Record<string, unknown>;
    let beneficiaryTransactionId: bigint | null = null;
    let depositTransactionId: bigint | null = null;
    let success = true;
    let errorMessage: string | null = null;

    logger.info({ data }, "Processing Unit Webhook Received");

    try {
      const moduleName = (data.module as string | undefined) ?? null;
      if (!moduleName) {
        logger.warn({ data }, "Webhook missing module");
        return res.status(200).json({ received: true });
      }

      if (moduleName === "withdraw") {
        const result = await handleWithdraw(data);
        beneficiaryTransactionId = result.beneficiaryTransactionId;
        success = result.success;
        errorMessage = result.errorMessage;
      } else if (moduleName === "deposit") {
        const result = await handleDeposit(data);
        depositTransactionId = result.depositTransactionId;
      } else {
        logger.warn({ moduleName }, "Unknown module from Processing Unit");
      }
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err, data }, "Processing Unit Webhook Failed");
    } finally {
      const durationMs = Date.now() - start;
      void prisma()
        .externalServiceCall.create({
          data: {
            externalType: EXTERNAL_TYPE_PROCESSING_UNIT,
            action: EXTERNAL_CALL_FOR_CALLBACK,
            method: "POST",
            endpoint: "processingunit-webhook",
            beneficiary_transaction_id: beneficiaryTransactionId,
            deposit_transaction_id: depositTransactionId,
            requestPayload: {} as Prisma.InputJsonValue,
            response_payload: data as Prisma.InputJsonValue,
            http_status: null,
            success,
            response_time_ms: durationMs,
            external_reference_id: (data.utr_number as string | undefined) ?? undefined,
            errorMessage: success ? null : errorMessage,
          },
        })
        .catch((err) =>
          logger.warn({ err }, "PU webhook audit write failed"),
        );
    }

    return res.status(200).json({ received: true });
  },
};

async function handleWithdraw(data: Record<string, unknown>): Promise<{
  beneficiaryTransactionId: bigint | null;
  success: boolean;
  errorMessage: string | null;
}> {
  const orderId = (data.order_id as string | undefined) ?? null;
  const status = (data.status as string | undefined) ?? null;
  const utr = (data.utr_number as string | undefined) ?? null;
  const serviceType = (data.service_type as string | undefined) ?? null;
  const rail = (data.rail as string | undefined) ?? null;
  const message = (data.message as string | undefined) ?? null;
  const serviceMid = (data.service_mid as string | undefined) ?? null;

  if (!orderId || !status) {
    logger.warn({ data }, "Missing order_id or status");
    return { beneficiaryTransactionId: null, success: true, errorMessage: null };
  }

  const txn = await prisma().beneficiaryTransaction.findFirst({
    where: { orderId },
  });
  if (!txn) {
    logger.warn({ orderId }, "Transaction not found for order_id");
    return { beneficiaryTransactionId: null, success: true, errorMessage: null };
  }

  const oldStatus = txn.status;
  const statusMap = mapProcessingUnitWithdrawStatus(status);
  const mappedStatus = statusMap.mapped;
  let success = !statusMap.isNew;
  let errorMessage = statusMap.isNew
    ? `New status received: ${statusMap.original}`
    : null;

  let finalStatus: number | null = null;
  if (oldStatus === BENEFICIARY_TRANSACTION_COMPLETED) {
    if (mappedStatus === BENEFICIARY_TRANSACTION_FAILED) {
      logger.warn({ orderId }, "Update for COMPLETED -> FAILED txn");
      finalStatus = BENEFICIARY_TRANSACTION_FAILED;
    } else {
      finalStatus = BENEFICIARY_TRANSACTION_COMPLETED;
    }
  } else {
    finalStatus = mappedStatus;
  }
  if (finalStatus === null || finalStatus === oldStatus) {
    finalStatus = oldStatus;
  }

  const updateData: Record<string, unknown> = { status: finalStatus };
  if (utr) {
    updateData.externalReferenceId = utr;
  }
  if (!utr && !txn.externalReferenceId && finalStatus === BENEFICIARY_TRANSACTION_COMPLETED) {
    updateData.externalReferenceId = txn.txnRefNo;
  }
  if (serviceType) {
    updateData.externalType = mapProcessingUnitServiceToExternalType(serviceType);
  }
  if (rail) {
    updateData.rail = rail;
  }
  if (message) {
    updateData.notes = message;
  }
  if (finalStatus !== BENEFICIARY_TRANSACTION_FAILED) {
    updateData.notes = null;
  }
  if (serviceMid) {
    updateData.serviceMid = serviceMid.toUpperCase();
  }

  // Reverse refund logic if a refund was previously generated and status moves back to initiated/processing
  const originalLedger = await prisma().ledger.findFirst({
    where: {
      transactionType: MORPH_BENEFICIARY_TRANSACTION,
      transactionId: txn.id,
    },
  });
  if (originalLedger) {
    const refundLedger = await prisma().ledger.findFirst({
      where: { refundLedgerId: originalLedger.id },
    });
    if (
      refundLedger &&
      txn.status === BENEFICIARY_TRANSACTION_FAILED &&
      [
        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        BENEFICIARY_TRANSACTION_COMPLETED,
      ].includes(mappedStatus)
    ) {
      logger.info({ orderId }, "Reversing refund for FAILED -> COMPLETED/INITIATED/PROCESSING txn");
      const { reverseRefund } = await import("../../services/beneficiaryTransactions/refundService");
      await reverseRefund(txn);
    }
  }

  const updated = await prisma().beneficiaryTransaction.update({
    where: { id: txn.id },
    data: updateData,
  });
  if (finalStatus !== oldStatus) {
    await prisma().beneficiaryTransactionStatusHistory.create({
      data: {
        uniqueId: uniqueId(24),
        beneficiaryTransactionId: txn.id,
        fromStatus: String(oldStatus),
        toStatus: String(finalStatus),
        changedBy: "system",
        changedByType: "system",
        changedAt: new Date(),
        meta: { source: "processingunit_webhook" } as Prisma.InputJsonValue,
      },
    });
  }
  logger.info(
    { orderId, oldStatus, newStatus: finalStatus },
    "BeneficiaryTransaction updated by PU webhook",
  );

  if (finalStatus === BENEFICIARY_TRANSACTION_COMPLETED) {
    await Dispatch.callback({
      userId: txn.userId.toString(),
      eventType: CALLBACK_PAYOUT_SUCCESS,
      payload: beneficiaryTransactionCallbackPayload(updated) as unknown as Record<
        string,
        unknown
      >,
      beneficiaryTransactionUniqueId: txn.uniqueId,
    });
    await Dispatch.debitNotification({
      beneficiaryTransactionId: txn.id.toString(),
    });
  } else if (finalStatus === BENEFICIARY_TRANSACTION_FAILED) {
    await Dispatch.callback({
      userId: txn.userId.toString(),
      eventType: CALLBACK_PAYOUT_REJECTED,
      payload: beneficiaryTransactionCallbackPayload(updated) as unknown as Record<
        string,
        unknown
      >,
      beneficiaryTransactionUniqueId: txn.uniqueId,
    });
    if (oldStatus !== BENEFICIARY_TRANSACTION_FAILED) {
      await createRefund(updated).catch((err) =>
        logger.error({ err, txnId: txn.uniqueId }, "createRefund threw"),
      );
    }
  }

  return { beneficiaryTransactionId: txn.id, success, errorMessage };
}

async function handleDeposit(data: Record<string, unknown>): Promise<{
  depositTransactionId: bigint | null;
}> {
  const orderId = (data.order_id as string | undefined) ?? null;
  const status = (data.status as string | undefined) ?? null;

  if (!orderId || !status) {
    logger.warn({ data }, "Missing order_id or status (deposit)");
    return { depositTransactionId: null };
  }

  const txn = await prisma().depositTransaction.findFirst({
    where: {
      uniqueId: orderId,
      status: {
        in: [
          DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
          DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        ],
      },
    },
  });
  if (!txn) {
    logger.warn({ orderId }, "DepositTransaction not found for order_id");
    return { depositTransactionId: null };
  }

  const statusMap = mapProcessingUnitDepositStatus(status);
  const oldStatus = txn.status;
  const mappedStatus = statusMap.mapped;

  await prisma().depositTransaction.update({
    where: { id: txn.id },
    data: { status: mappedStatus },
  });
  await prisma().depositTransactionStatusHistory.create({
    data: {
      uniqueId: uniqueId(24),
      depositTransactionId: txn.id,
      fromStatus: String(oldStatus),
      toStatus: String(mappedStatus),
      changedBy: "system",
      changedByType: "system",
      changedAt: new Date(),
      meta: { source: "processingunit_webhook" } as never,
    },
  });

  // Mirror Helper::updateLedger - on COMPLETED, write a credit ledger
  // row keyed off the DepositTransaction polymorphic morph.
  if (mappedStatus === DEPOSIT_TRANSACTION_COMPLETED) {
    const existing = await prisma().ledger.findFirst({
      where: {
        transactionType: MORPH_DEPOSIT_TRANSACTION,
        transactionId: txn.id,
      },
    });
    if (!existing) {
      const user = await prisma().user.findUnique({ where: { id: txn.userId } });
      const va = await prisma().virtualAccount.findUnique({ where: { id: txn.virtualAccountId } });
      if (!user || !va) {
        logger.error({ txnId: txn.uniqueId }, "User or VA not found for deposit ledger record");
        return { depositTransactionId: txn.id };
      }

      const { computeBankBalance } = await import("../../services/virtualAccounts/balanceService");
      const currentBalance = await computeBankBalance(user, va);

      await prisma().ledger.create({
        data: {
          uniqueId: uniqueId(24),
          userId: txn.userId,
          virtualAccountId: txn.virtualAccountId,
          walletId: null,
          transactionType: MORPH_DEPOSIT_TRANSACTION,
          transactionId: txn.id,
          balance: currentBalance,
          externalType: txn.externalType ?? EXTERNAL_TYPE_PROCESSING_UNIT,
          description: `Deposit ${txn.uniqueId}`,
        },
      });
    }
  }

  logger.info(
    { orderId, oldStatus, newStatus: mappedStatus },
    "DepositTransaction updated by PU webhook",
  );

  return { depositTransactionId: txn.id };
}
