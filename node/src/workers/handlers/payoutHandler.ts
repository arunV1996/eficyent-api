import { v4 as uuidv4 } from "uuid";
import { Job } from "bullmq";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_APPROVED,
  BENEFICIARY_TRANSACTION_FAILED,
  BENEFICIARY_TRANSACTION_INITIATED,
  BENEFICIARY_TRANSACTION_PROCESSING,
  BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  PAYOUT_JOB_STATUS_COMPLETED,
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PROCESSING,
} from "../../helpers/constants";
import { PayoutJobPayload } from "../../queues/dispatchers";
import { ProcessingUnit } from "../../services/external/processingUnit";
import { Compliance } from "../../services/external/compliance";
import { InvoiceMate } from "../../services/external/invoiceMate";
import { settingGet } from "../../services/settings/settingsService";

/**
 * Mirror of Laravel's ProcessBulkPayout / payout dispatch path. Drives a
 * single beneficiary transaction through external service initiation.
 *
 * The external service call chain (Caliza / Diginine / FvBank /
 * ProcessingUnit) lands in Phase 8. Until then this handler advances the
 * status to PROCESSING and records the history row, which is enough to
 * unblock end-to-end testing of the full payout API surface.
 *
 * Idempotency is enforced at *two* layers:
 *   1. Queue-level: BullMQ jobId = "payout:{txnId}" - duplicate enqueues
 *      collapse to one job. This protects against retry storms inside the
 *      worker pool.
 *   2. Row-level: we only transition a transaction whose status is
 *      WAITING_FOR_APPROVAL or APPROVED. Any other status is a no-op so
 *      delayed retries from BullMQ never double-transmit.
 */

export async function processPayout(job: Job<PayoutJobPayload>): Promise<void> {
  const { beneficiaryTransactionId, payoutJobUniqueId, userId } = job.data;
  const reqLogger = logger.child({
    queue: "payout",
    jobId: job.id,
    txnId: beneficiaryTransactionId,
    userId,
  });

  await prisma()
    .payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: { status: PAYOUT_JOB_STATUS_PROCESSING, attempts: { increment: 1 } },
    })
    .catch(() => undefined);

  if (!beneficiaryTransactionId) {
    reqLogger.info("PayoutJob without linked transaction - external dispatch deferred");
    return;
  }

  try {
    const txn = await prisma().beneficiaryTransaction.findUnique({
      where: { id: BigInt(beneficiaryTransactionId) },
    });
    if (!txn) {
      reqLogger.warn("Transaction not found - ignoring");
      return;
    }

    const dispatchable = [
      BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
      BENEFICIARY_TRANSACTION_APPROVED,
      BENEFICIARY_TRANSACTION_INITIATED,
    ];
    if (!dispatchable.includes(txn.status)) {
      reqLogger.info({ status: txn.status }, "Transaction not in dispatchable state");
      return;
    }

    await prisma().$transaction([
      prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: { status: BENEFICIARY_TRANSACTION_PROCESSING },
      }),
      prisma().beneficiaryTransactionStatusHistory.create({
        data: {
          uniqueId: cryptoRandomId(),
          beneficiaryTransactionId: txn.id,
          fromStatus: String(txn.status),
          toStatus: String(BENEFICIARY_TRANSACTION_PROCESSING),
          changedBy: "system",
          changedByType: "system",
          changedAt: new Date(),
        },
      }),
    ]);

    // Mirror Helper::processTransaction: when the compliance_panel
    // setting is ENABLED, dispatch through Compliance first; otherwise
    // ProcessingUnit takes the transaction directly. Each driver owns
    // its own status transitions and error notifications.
    const user = await prisma().user.findUnique({ where: { id: txn.userId } });
    if (user) {
      const compliancePanel = await settingGet<string>("compliance_panel", "0");
      if (compliancePanel === "1" || compliancePanel === "ENABLED") {
        await Compliance.make(txn, user);
      } else {
        await ProcessingUnit.make(txn, user);
      }
      // Best-effort InvoiceMate accounting.
      void InvoiceMate.makePayout(txn, user);
    }

    await prisma().payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: {
        status: PAYOUT_JOB_STATUS_COMPLETED,
        errorMessage: null,
        beneficiaryTransactionId: txn.id,
      },
    });
    reqLogger.info("Payout dispatched to ProcessingUnit/Compliance");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reqLogger.error({ err }, "Payout job error");
    await prisma()
      .payoutJob.update({
        where: { uniqueId: payoutJobUniqueId },
        data: {
          status: PAYOUT_JOB_STATUS_FAILED,
          errorMessage: message.slice(0, 1024),
        },
      })
      .catch(() => undefined);
    if (beneficiaryTransactionId) {
      await prisma()
        .beneficiaryTransaction.update({
          where: { id: BigInt(beneficiaryTransactionId) },
          data: { status: BENEFICIARY_TRANSACTION_FAILED },
        })
        .catch(() => undefined);
    }
    throw err;
  }
}

function cryptoRandomId(): string {
  // Generate a standard UUID v4 string for the unique_id column.
  return uuidv4();
}
