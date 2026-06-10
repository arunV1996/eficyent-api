import { Job } from "bullmq";
import { Prisma } from "@prisma/client";
import { logger } from "../../helpers/logger";
import { CallbackJobPayload } from "../../queues/dispatchers";
import { sendMerchantCallback } from "../../services/callbacks/merchantCallbackDispatcher";
import { prisma } from "../../db/prisma";
import {
  MORPH_BENEFICIARY_TRANSACTION_CALLBACK_LOG,
  MORPH_DEPOSIT_TRANSACTION,
} from "../../helpers/constants";

/**
 * Mirror of Laravel SendCallbackJob.
 *
 * Resolves the merchant's callback_url for the given user, posts the
 * Laravel-shaped envelope ({event, data, timestamp}), and writes a
 * polymorphic callback_logs row keyed off the BeneficiaryTransaction or
 * DepositTransaction when the payload carries a unique_id.
 *
 * Failure semantics mirror Laravel: the job swallows the error so we log
 * an audit row even on transport failure. BullMQ will not retry — the
 * Laravel job didn't either.
 */
export async function processCallback(job: Job<CallbackJobPayload>): Promise<void> {
  const {
    userId,
    eventType,
    payload,
    beneficiaryTransactionUniqueId,
    depositTransactionUniqueId,
  } = job.data;
  logger.info({ jobId: job.id, userId, eventType }, "SendCallbackJob started");

  const result = await sendMerchantCallback(BigInt(userId), eventType, payload);

  const txnUniqueId =
    beneficiaryTransactionUniqueId ??
    depositTransactionUniqueId ??
    (typeof payload?.unique_id === "string" ? (payload.unique_id as string) : null);

  if (txnUniqueId) {
    let loggableId: bigint | null = null;
    let loggableType: string | null = null;

    const txn = await prisma().beneficiaryTransaction.findUnique({
      where: { uniqueId: txnUniqueId },
      select: { id: true },
    });
    if (txn) {
      loggableId = txn.id;
      loggableType = MORPH_BENEFICIARY_TRANSACTION_CALLBACK_LOG;
    } else {
      const dep = await prisma().depositTransaction.findFirst({
        where: { uniqueId: txnUniqueId },
        select: { id: true },
      });
      if (dep) {
        loggableId = dep.id;
        loggableType = MORPH_DEPOSIT_TRANSACTION;
      }
    }

    if (loggableId && loggableType) {
      await prisma()
        .callbackLog.create({
          data: {
            loggableType,
            loggableId,
            logs: result as unknown as Prisma.InputJsonValue,
          },
        })
        .catch((err) =>
          logger.warn({ err, txnUniqueId }, "callback_logs write failed"),
        );
    }
  }

  logger.info(
    { jobId: job.id, userId, eventType, sendCallback: result.sendCallback },
    "SendCallbackJob ended",
  );
}
