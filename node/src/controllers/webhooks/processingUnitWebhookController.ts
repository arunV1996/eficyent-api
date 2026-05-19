import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_COMPLETED,
  BENEFICIARY_TRANSACTION_FAILED,
  CALLBACK_PAYOUT_REJECTED,
  CALLBACK_PAYOUT_SUCCESS,
  DEPOSIT_TRANSACTION_COMPLETED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
  DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
  EXTERNAL_CALL_FOR_CALLBACK,
  EXTERNAL_TYPE_PROCESSING_UNIT,
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
    const utr = (data.utr_number as string | undefined) ?? null;
    let beneficiaryTransactionId: bigint | null = null;
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
        await handleDeposit(data);
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
            requestPayload: data as Prisma.InputJsonValue,
            response_payload: { received: true } as Prisma.InputJsonValue,
            http_status: 200,
            success,
            response_time_ms: durationMs,
            errorMessage: success ? null : errorMessage,
          },
        })
        .catch((err) =>
          logger.warn({ err }, "PU webhook audit write failed"),
        );
      void utr;
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
  } else if (
    serviceType === "EVP" &&
    mappedStatus === BENEFICIARY_TRANSACTION_FAILED
  ) {
    logger.info({ orderId }, "Skipping rejected transaction for EVP");
    success = false;
    errorMessage = "Skipping rejected status for EVP";
  } else {
    finalStatus = mappedStatus;
  }
  if (finalStatus === null || finalStatus === oldStatus) {
    finalStatus = oldStatus;
  }

  const updateData: Record<string, unknown> = { status: finalStatus };
  if (utr) updateData.externalReferenceId = utr;
  if (serviceType) {
    updateData.externalType = mapProcessingUnitServiceToExternalType(serviceType);
  }
  if (rail) updateData.rail = rail;
  if (message) updateData.notes = message;
  if (serviceMid) updateData.serviceMid = serviceMid.toUpperCase();

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

async function handleDeposit(data: Record<string, unknown>): Promise<void> {
  const orderId = (data.order_id as string | undefined) ?? null;
  const status = (data.status as string | undefined) ?? null;

  if (!orderId || !status) {
    logger.warn({ data }, "Missing order_id or status (deposit)");
    return;
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
    return;
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
      await prisma().ledger.create({
        data: {
          uniqueId: uniqueId(24),
          userId: txn.userId,
          virtualAccountId: txn.virtualAccountId,
          walletId: null,
          transactionType: MORPH_DEPOSIT_TRANSACTION,
          transactionId: txn.id,
          balance: txn.totalAmount,
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
}
