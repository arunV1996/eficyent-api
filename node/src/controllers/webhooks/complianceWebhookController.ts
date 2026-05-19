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

      // Match on compliance_data.transaction_id (Laravel uses
      // `compliance_data->transaction_id` JSON path) AND status in
      // (COMPLIANCE_INITIATED, COMPLIANCE_HOLD).
      const txn = await prisma().beneficiaryTransaction.findFirst({
        where: {
          status: {
            in: [
              BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
              BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
            ],
          },
          complianceData: {
            path: ["transaction_id"],
            equals: complianceTransactionId,
          } as Prisma.JsonFilter,
        },
      });

      if (!txn) {
        logger.warn(
          { complianceTransactionId },
          "Local transaction not found for compliance webhook",
        );
        return res.status(200).json({ status: "not_found" });
      }

      beneficiaryTransactionId = txn.id;
      externalReferenceId = complianceTransactionId;

      const updates: { status?: number; complianceNotes?: string | null } = {
        complianceNotes: (data.notes as string | undefined) ?? null,
      };

      if (event === "transaction.approved" && complianceStatus === "PASSED") {
        updates.status = BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED;

        const updated = await prisma().beneficiaryTransaction.update({
          where: { id: txn.id },
          data: updates,
        });

        // Defer the ProcessingUnit hand-off so the webhook reply doesn't
        // wait on outbound HTTP. The Compliance->PU promotion is the
        // exact Laravel flow at line 96 of the original controller.
        const user = await prisma().user.findUnique({ where: { id: txn.userId } });
        if (user) {
          const { ProcessingUnit } = await import(
            "../../services/external/processingUnit"
          );
          void ProcessingUnit.make(updated, user);
        }
      } else if (event === "transaction.rejected" || complianceStatus === "FAILED") {
        updates.status = BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED;
        await prisma().beneficiaryTransaction.update({
          where: { id: txn.id },
          data: updates,
        });
      } else {
        await prisma().beneficiaryTransaction.update({
          where: { id: txn.id },
          data: { complianceNotes: updates.complianceNotes ?? null },
        });
      }

      responseBody = data;
      success = true;
      logger.info(
        { txnId: txn.id.toString(), newStatus: updates.status ?? txn.status },
        "Compliance transaction updated",
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
