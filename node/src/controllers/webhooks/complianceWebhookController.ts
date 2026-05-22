import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
  BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
  BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
  EXTERNAL_CALL_FOR_CALLBACK,
  EXTERNAL_TYPE_COMPLIANCE,
} from "../../helpers/constants";
import { uniqueId } from "../../helpers/uniqueId";

/**
 * Mirror of App\\Http\\Controllers\\Api\\Callbacks\\ComplianceWebhookController.
 *
 * Always returns 200 to prevent the upstream from retrying. Persists an
 * external_service_calls audit row regardless of outcome (mirror of
 * ExternalServiceCallLogger). On `transaction.approved` + complianceStatus
 * PASSED the transaction is moved to COMPLIANCE_APPROVED and immediately
 * dispatched to ProcessingUnit. On `transaction.rejected` or
 * complianceStatus FAILED the transaction moves to COMPLIANCE_REJECTED.
 */
export const complianceWebhookController = {
  async invoke(req: Request, res: Response): Promise<Response> {
    console.log("Compliance Webhook Received:", JSON.stringify(req.body));
    const start = Date.now();
    const payload = (req.body ?? {}) as Record<string, unknown>;

    let beneficiaryTransactionId: bigint | null = null;
    let externalReferenceId: string | null = null;
    let success = false;
    let errorMessage: string | null = null;
    let responseBody: unknown = null;
    let status = 200;

    try {
      logger.info({ payload }, "Compliance webhook received");

      const event = (payload.event as string | undefined) ?? null;
      const data = (payload.data as Record<string, unknown> | undefined) ?? null;

      if (!event || !data) {
        logger.warn("Invalid compliance webhook structure");
        responseBody = { status: "ignored" };
        success = true;
        return res.status(200).json({ status: "ignored" });
      }

      const complianceTransactionId =
        (data.transactionId as string | undefined) ?? null;
      const complianceStatus =
        (data.complianceStatus as string | undefined) ?? null;

      if (!complianceTransactionId) {
        logger.warn("Compliance webhook missing transactionId");
        return res.status(200).json({ status: "ignored" });
      }

      // 1. Primary Lookup: Match on compliance_data.transaction_id
      let txn = await prisma().beneficiaryTransaction.findFirst({
        where: {
          status: {
            in: [
              BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
              BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
            ],
          },
          complianceData: {
            path: "$.transaction_id",
            equals: complianceTransactionId,
          } as Prisma.JsonFilter,
        },
      });

      // 2. Secondary Lookup: Fallback to matching on complianceData.id or search by reference
      if (!txn) {
        txn = await prisma().beneficiaryTransaction.findFirst({
          where: {
            status: {
              in: [
                BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
                BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
              ],
            },
            complianceData: {
              path: "$.id",
              equals: complianceTransactionId,
            } as Prisma.JsonFilter,
          },
        });
      }

      // 3. Last Resort: Try orderId match if the provider returned our orderId as their transactionId
      if (!txn) {
        txn = await prisma().beneficiaryTransaction.findFirst({
          where: {
            orderId: complianceTransactionId,
          },
        });
      }

      if (!txn) {
        logger.warn(
          { complianceTransactionId, data },
          "Local transaction not found for compliance webhook (after fallbacks)",
        );
        return res.status(200).json({ status: "not_found" });
      }

      beneficiaryTransactionId = txn.id;
      externalReferenceId = complianceTransactionId;

      const oldStatus = txn.status;
      const updates: { status?: number; complianceNotes?: string | null } = {
        complianceNotes: (data.notes as string | undefined) ?? null,
      };

      if (event === "transaction.approved" && complianceStatus === "PASSED") {
        updates.status = BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED;
      } else if (event === "transaction.rejected" || complianceStatus === "FAILED") {
        updates.status = BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED;
      }

      const updated = await prisma().beneficiaryTransaction.update({
        where: { id: txn.id },
        data: updates,
      });

      // Record Status History
      if (updates.status && updates.status !== oldStatus) {
        await prisma().beneficiaryTransactionStatusHistory.create({
          data: {
            uniqueId: uniqueId(24),
            beneficiaryTransactionId: txn.id,
            fromStatus: String(oldStatus),
            toStatus: String(updates.status),
            changedBy: "system",
            changedByType: "system",
            changedAt: new Date(),
            meta: { source: "compliance_webhook" } as Prisma.InputJsonValue,
          },
        });
      }

      // Promotion logic: if APPROVED, hand off to ProcessingUnit
      if (updates.status === BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED) {
        const user = await prisma().user.findUnique({ where: { id: txn.userId } });
        if (user) {
          const { ProcessingUnit } = await import(
            "../../services/external/processingUnit"
          );
          void ProcessingUnit.make(updated, user);
        }
      }

      responseBody = data;
      success = true;
      logger.info(
        { txnId: txn.id.toString(), newStatus: updates.status ?? oldStatus },
        "Compliance transaction updated via webhook",
      );
      return res.status(200).json({ status: "success" });
    } catch (err) {
      status = 500;
      errorMessage = err instanceof Error ? err.message : String(err);
      responseBody = { status: "error", message: errorMessage };
      logger.error({ err, payload }, "Compliance webhook failed");
      return res.status(200).json({ status: "error" });
    } finally {
      const durationMs = Date.now() - start;
      void prisma()
        .externalServiceCall.create({
          data: {
            externalType: EXTERNAL_TYPE_COMPLIANCE,
            action: EXTERNAL_CALL_FOR_CALLBACK,
            method: "POST",
            endpoint: "compliance/webhook-callback",
            beneficiary_transaction_id: beneficiaryTransactionId,
            requestPayload: payload as Prisma.InputJsonValue,
            response_payload: (responseBody ?? null) as Prisma.InputJsonValue,
            http_status: status,
            success: status >= 200 && status < 300,
            response_time_ms: durationMs,
            errorMessage,
          },
        })
        .catch((err) =>
          logger.warn({ err }, "compliance webhook audit write failed"),
        );
      void externalReferenceId;
      void success;
    }
  },
};
