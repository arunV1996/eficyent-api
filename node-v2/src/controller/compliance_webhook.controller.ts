import { Request, Response } from "express";
import { literal, Op } from "sequelize";
import sequelize from "../config/database";
import { recordStatusHistory } from "../helpers/beneficiary_transaction.helper";
import { Dispatch } from "../jobs";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import ExternalServiceCall from "../models/external_service_call.model";
import PayoutJob from "../models/payout_job.model";
import {
    BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
    EXTERNAL_CALL_FOR_CALLBACK,
    EXTERNAL_TYPE_COMPLIANCE,
} from "../utils/constants";

/**
 * Mirror of the legacy complianceWebhookController
 * (App\Http\Controllers\Api\Callbacks\ComplianceWebhookController).
 *
 * Always returns 200 to prevent the upstream from retrying. Persists an
 * external_service_calls audit row regardless of outcome. On
 * `transaction.approved` + complianceStatus PASSED the transaction is
 * moved to COMPLIANCE_APPROVED and immediately handed off to the
 * Processing Unit for payout initiation; on `transaction.rejected` or
 * complianceStatus FAILED it moves to COMPLIANCE_REJECTED.
 */

const PENDING_COMPLIANCE_STATUSES = [
    BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
];

/**
 * MySQL JSON-path equality condition (mirror of the Prisma JsonFilter
 * `{path, equals}` lookups on compliance_data).
 */
const complianceDataPathEquals = (jsonPath: string, value: string) => {
    return literal(
        `JSON_UNQUOTE(JSON_EXTRACT(compliance_data, '${jsonPath}')) = ${sequelize.escape(value)}`,
    );
};

/**
 * POST /api/compliance/webhook-callback
 */
export const complianceWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log("Compliance Webhook Received:", JSON.stringify(req.body));
    const startedAt = Date.now();
    const payload = (req.body ?? {}) as Record<string, unknown>;

    let beneficiaryTransactionId: number | null = null;
    let responseBody: unknown = null;
    let httpStatus = 200;
    let errorMessage: string | null = null;

    try {
        const event = (payload.event as string | undefined) ?? null;
        const data =
            (payload.data as Record<string, unknown> | undefined) ?? null;

        if (!event || !data) {
            // eslint-disable-next-line no-console
            console.warn("Invalid compliance webhook structure");
            responseBody = { status: "ignored" };
            res.status(200).json({ status: "ignored" });
            return;
        }

        const complianceTransactionId =
            (data.transactionId as string | undefined) ?? null;
        const complianceStatus =
            (data.complianceStatus as string | undefined) ?? null;

        if (!complianceTransactionId) {
            // eslint-disable-next-line no-console
            console.warn("Compliance webhook missing transactionId");
            res.status(200).json({ status: "ignored" });
            return;
        }

        // 1. Primary lookup: match on compliance_data.transaction_id.
        let transaction = await BeneficiaryTransaction.findOne({
            where: {
                status: { [Op.in]: PENDING_COMPLIANCE_STATUSES },
                [Op.and]: [
                    complianceDataPathEquals(
                        "$.transaction_id",
                        complianceTransactionId,
                    ),
                ],
            },
        });

        // 2. Secondary lookup: fall back to compliance_data.id.
        if (!transaction) {
            transaction = await BeneficiaryTransaction.findOne({
                where: {
                    status: { [Op.in]: PENDING_COMPLIANCE_STATUSES },
                    [Op.and]: [
                        complianceDataPathEquals(
                            "$.id",
                            complianceTransactionId,
                        ),
                    ],
                },
            });
        }

        // 3. Last resort: the provider may have echoed our orderId back
        //    as their transactionId.
        if (!transaction) {
            transaction = await BeneficiaryTransaction.findOne({
                where: { orderId: complianceTransactionId },
            });
        }

        if (!transaction) {
            // eslint-disable-next-line no-console
            console.warn(
                "Local transaction not found for compliance webhook (after fallbacks):",
                complianceTransactionId,
            );
            res.status(200).json({ status: "not_found" });
            return;
        }

        if (!PENDING_COMPLIANCE_STATUSES.includes(transaction.status)) {
            // eslint-disable-next-line no-console
            console.info(
                `Transaction ${transaction.id} compliance already processed (status ${transaction.status}), ignoring duplicate webhook`,
            );
            res.status(200).json({ status: "success" });
            return;
        }

        beneficiaryTransactionId = transaction.id;

        const oldStatus = transaction.status;
        const updates: { status?: number; complianceNotes: string | null } = {
            complianceNotes: (data.notes as string | undefined) ?? null,
        };

        if (event === "transaction.approved" && complianceStatus === "PASSED") {
            updates.status = BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED;
        } else if (
            event === "transaction.rejected" ||
            complianceStatus === "FAILED"
        ) {
            updates.status = BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED;
        }

        await transaction.update(updates);

        if (updates.status !== undefined && updates.status !== oldStatus) {
            await recordStatusHistory(
                transaction.id,
                oldStatus,
                updates.status,
                "system",
                "system",
                { source: "compliance_webhook" },
            );
        }

        if (updates.status === BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED) {
            // Hand off to the Processing Unit via the background queue
            // instead of initiating synchronously — the webhook must
            // still answer 200 promptly regardless of how the
            // downstream initiation resolves.
            const payoutJob = await PayoutJob.findOne({
                where: { beneficiaryTransactionId: transaction.id },
            });
            void Dispatch.payout({
                beneficiaryTransactionId: String(transaction.id),
                payoutJobUniqueId: payoutJob?.uniqueId ?? "",
                userId: String(transaction.userId),
                source: "approval",
            }).catch((dispatchError) => {
                // eslint-disable-next-line no-console
                console.error(
                    `ProcessingUnit dispatch failed for ${transaction.uniqueId}:`,
                    dispatchError,
                );
            });
        }

        responseBody = data;
        // eslint-disable-next-line no-console
        console.info(
            `Compliance transaction ${transaction.id} updated via webhook (status ${updates.status ?? oldStatus})`,
        );
        res.status(200).json({ status: "success" });
        return;
    } catch (webhookError) {
        httpStatus = 500;
        errorMessage =
            webhookError instanceof Error
                ? webhookError.message
                : String(webhookError);
        responseBody = { status: "error", message: errorMessage };
        // eslint-disable-next-line no-console
        console.error("Compliance webhook failed:", webhookError);
        res.status(200).json({ status: "error" });
        return;
    } finally {
        const durationMs = Date.now() - startedAt;
        ExternalServiceCall.create({
            externalType: EXTERNAL_TYPE_COMPLIANCE,
            action: EXTERNAL_CALL_FOR_CALLBACK,
            method: "POST",
            endpoint: "compliance/webhook-callback",
            beneficiaryTransactionId,
            requestPayload: payload,
            responsePayload: responseBody ?? null,
            httpStatus,
            success: httpStatus >= 200 && httpStatus < 300,
            responseTimeMs: durationMs,
            errorMessage,
        }).catch((auditError) => {
            // eslint-disable-next-line no-console
            console.warn("compliance webhook audit write failed:", auditError);
        });
    }
};
