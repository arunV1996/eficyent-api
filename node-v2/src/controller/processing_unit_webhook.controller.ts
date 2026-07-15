import Decimal from "decimal.js";
import { Request, Response } from "express";
import { Op } from "sequelize";
import {
    beneficiaryTransactionCallbackPayload,
    depositTransactionCallbackPayload,
} from "../helpers/callback_payload.helper";
import { recordStatusHistory } from "../helpers/beneficiary_transaction.helper";
import { computeBankBalance } from "../helpers/balance.helper";
import { createRefund, reverseRefund } from "../helpers/refund.helper";
import { Dispatch } from "../jobs";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAccountValidation from "../models/beneficiary_account_validation.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import DepositTransactionStatusHistory from "../models/deposit_transaction_status_history.model";
import ExternalServiceCall from "../models/external_service_call.model";
import Ledger from "../models/ledger.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import {
    mapProcessingUnitDepositStatus,
    mapProcessingUnitServiceToExternalType,
    mapProcessingUnitWithdrawStatus,
} from "../services/processing_unit.service";
import * as pushNotificationService from "../services/push_notification.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    BENEFICIARY_TRANSACTION_COMPLETED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
    BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    CALLBACK_DEPOSIT_FAILED,
    CALLBACK_DEPOSIT_SUCCESS,
    CALLBACK_PAYOUT_REJECTED,
    CALLBACK_PAYOUT_SUCCESS,
    CALLBACK_VIRTUAL_ACCOUNT_CREATED,
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    DEPOSIT_TRANSACTION_REJECTED,
    EXTERNAL_CALL_FOR_CALLBACK,
    EXTERNAL_TYPE_CALIZA,
    EXTERNAL_TYPE_PROCESSING_UNIT,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_DEPOSIT_TRANSACTION,
    VIRTUAL_ACCOUNT_STATUS_CREATED,
    VIRTUAL_ACCOUNT_STATUS_FAILED,
} from "../utils/constants";

/**
 * Mirror of the legacy processingUnitWebhookController
 * (App\Http\Controllers\Api\Callbacks\ProcessingUnitWebhookController).
 *
 * Four modules on data.module:
 *   - "withdraw"             -> updates the BeneficiaryTransaction keyed
 *     by order_id, fires the merchant callback (PAYOUT_SUCCESS /
 *     PAYOUT_REJECTED), enqueues SendDebitNotification on COMPLETED,
 *     runs createRefund on FAILED transitions (skipping when the old
 *     status was already FAILED) and reverseRefund when a refunded
 *     transaction moves back to initiated/processing/completed.
 *   - "deposit"              -> updates the DepositTransaction and
 *     writes the credit ledger row when the deposit lands (mirror of
 *     Helper::updateLedger).
 *   - "verify_bank_account"  -> caches the provider account-validation
 *     result in beneficiary_account_validations.
 *   - "caliza_virtual_account" -> activates/fails the Caliza virtual
 *     account and fires the BANK_ACCOUNT_CREATED merchant callback.
 *
 * Always returns 200 — any 4xx/5xx would prompt PU to retry.
 */

const normalizeDecimalString = (value: string | null | undefined): string => {
    return new Decimal(value || 0).toString();
};

const handleWithdraw = async (
    data: Record<string, unknown>,
): Promise<{
    beneficiaryTransactionId: number | null;
    success: boolean;
    errorMessage: string | null;
}> => {
    const orderId = (data.order_id as string | undefined) ?? null;
    const status = (data.status as string | undefined) ?? null;
    const utrNumber = (data.utr_number as string | undefined) ?? null;
    const serviceType = (data.service_type as string | undefined) ?? null;
    const rail = (data.rail as string | undefined) ?? null;
    const message = (data.message as string | undefined) ?? null;
    const serviceMid = (data.service_mid as string | undefined) ?? null;

    if (!orderId || !status) {
        // eslint-disable-next-line no-console
        console.warn("PU webhook: missing order_id or status");
        return {
            beneficiaryTransactionId: null,
            success: true,
            errorMessage: null,
        };
    }

    const transaction = await BeneficiaryTransaction.findOne({
        where: { orderId },
    });
    if (!transaction) {
        // eslint-disable-next-line no-console
        console.warn(`PU webhook: transaction not found for order_id ${orderId}`);
        return {
            beneficiaryTransactionId: null,
            success: true,
            errorMessage: null,
        };
    }

    const oldStatus = transaction.status;
    const statusMap = mapProcessingUnitWithdrawStatus(status);
    const mappedStatus = statusMap.mapped;
    const success = !statusMap.isNew;
    const errorMessage = statusMap.isNew
        ? `New status received: ${statusMap.original}`
        : null;

    // COMPLETED transactions only ever regress to FAILED — every other
    // late update is ignored in favor of the terminal status.
    let finalStatus: number;
    if (oldStatus === BENEFICIARY_TRANSACTION_COMPLETED) {
        if (mappedStatus === BENEFICIARY_TRANSACTION_FAILED) {
            // eslint-disable-next-line no-console
            console.warn(
                `PU webhook: update for COMPLETED -> FAILED txn ${orderId}`,
            );
            finalStatus = BENEFICIARY_TRANSACTION_FAILED;
        } else {
            finalStatus = BENEFICIARY_TRANSACTION_COMPLETED;
        }
    } else {
        finalStatus = mappedStatus;
    }

    const updateData: Record<string, unknown> = { status: finalStatus };
    if (utrNumber) {
        updateData.externalReferenceId = utrNumber;
    }
    if (
        !utrNumber &&
        !transaction.externalReferenceId &&
        finalStatus === BENEFICIARY_TRANSACTION_COMPLETED
    ) {
        updateData.externalReferenceId = transaction.txnRefNo;
    }
    if (serviceType) {
        updateData.externalType =
            mapProcessingUnitServiceToExternalType(serviceType);
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

    // Reverse-refund: when a refund was already issued and the status
    // moves back to initiated/processing/completed, the refund chain is
    // deleted so the funds are debited again.
    const originalLedger = await Ledger.findOne({
        where: {
            transactionType: MORPH_BENEFICIARY_TRANSACTION,
            transactionId: transaction.id,
        },
    });
    if (originalLedger) {
        const refundLedger = await Ledger.findOne({
            where: { refundLedgerId: originalLedger.id },
        });
        if (
            refundLedger &&
            [
                BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
                BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
                BENEFICIARY_TRANSACTION_COMPLETED,
            ].includes(mappedStatus)
        ) {
            // eslint-disable-next-line no-console
            console.info(
                `PU webhook: reversing refund for FAILED -> COMPLETED txn ${orderId}`,
            );
            await reverseRefund(transaction);
        }
    }

    await transaction.update(updateData);
    if (finalStatus !== oldStatus) {
        await recordStatusHistory(
            transaction.id,
            oldStatus,
            finalStatus,
            "system",
            "system",
            { source: "processingunit_webhook" },
        );
    }
    // eslint-disable-next-line no-console
    console.info(
        `BeneficiaryTransaction ${orderId} updated by PU webhook: ${oldStatus} -> ${finalStatus}`,
    );

    if (finalStatus === BENEFICIARY_TRANSACTION_COMPLETED) {
        await Dispatch.callback({
            userId: String(transaction.userId),
            eventType: CALLBACK_PAYOUT_SUCCESS,
            payload: beneficiaryTransactionCallbackPayload(transaction),
            beneficiaryTransactionUniqueId: transaction.uniqueId,
        });
        await Dispatch.debitNotification({
            beneficiaryTransactionId: String(transaction.id),
        });

        const transactionUser = await User.findByPk(transaction.userId);
        if (transactionUser?.deviceToken) {
            void pushNotificationService
                .sendToToken(transactionUser.deviceToken, {
                    title: "Withdrawal Successful",
                    body: `Your withdrawal of ${normalizeDecimalString(transaction.amount)} ${transaction.receivingCurrency || "USD"} has been completed successfully.`,
                    data: {
                        content_unique_id: transaction.uniqueId,
                        status: "COMPLETED",
                        type: "withdraw",
                    },
                })
                .catch((pushError) => {
                    // eslint-disable-next-line no-console
                    console.error(
                        "Failed to send successful withdraw push notification:",
                        pushError,
                    );
                });
        }
    } else if (finalStatus === BENEFICIARY_TRANSACTION_FAILED) {
        await Dispatch.callback({
            userId: String(transaction.userId),
            eventType: CALLBACK_PAYOUT_REJECTED,
            payload: beneficiaryTransactionCallbackPayload(transaction),
            beneficiaryTransactionUniqueId: transaction.uniqueId,
        });
        if (oldStatus !== BENEFICIARY_TRANSACTION_FAILED) {
            await createRefund(transaction).catch((refundError) => {
                // eslint-disable-next-line no-console
                console.error(
                    `createRefund threw for ${transaction.uniqueId}:`,
                    refundError,
                );
            });
            const transactionUser = await User.findByPk(transaction.userId);
            if (transactionUser?.deviceToken) {
                void pushNotificationService
                    .sendToToken(transactionUser.deviceToken, {
                        title: "Withdrawal Failed",
                        body: `Your withdrawal of ${normalizeDecimalString(transaction.amount)} ${transaction.receivingCurrency || "USD"} has failed.`,
                        data: {
                            content_unique_id: transaction.uniqueId,
                            status: "FAILED",
                            type: "withdraw",
                        },
                    })
                    .catch((pushError) => {
                        // eslint-disable-next-line no-console
                        console.error(
                            "Failed to send failed withdraw push notification:",
                            pushError,
                        );
                    });
            }
        }
    }

    return {
        beneficiaryTransactionId: transaction.id,
        success,
        errorMessage,
    };
};

const handleDeposit = async (
    data: Record<string, unknown>,
): Promise<{ depositTransactionId: number | null }> => {
    const orderId = (data.order_id as string | undefined) ?? null;
    const status = (data.status as string | undefined) ?? null;

    if (!orderId || !status) {
        // eslint-disable-next-line no-console
        console.warn("PU webhook: missing order_id or status (deposit)");
        return { depositTransactionId: null };
    }

    const deposit = await DepositTransaction.findOne({
        where: {
            uniqueId: orderId,
            status: {
                [Op.in]: [
                    DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
                    DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
                ],
            },
        },
    });
    if (!deposit) {
        // eslint-disable-next-line no-console
        console.warn(
            `PU webhook: DepositTransaction not found for order_id ${orderId}`,
        );
        return { depositTransactionId: null };
    }

    const depositUser = await User.findByPk(deposit.userId);
    const virtualAccount = await VirtualAccount.findByPk(
        deposit.virtualAccountId,
    );

    const statusMap = mapProcessingUnitDepositStatus(status);
    const oldStatus = deposit.status;
    const mappedStatus = statusMap.mapped;

    await deposit.update({ status: mappedStatus });
    await DepositTransactionStatusHistory.create({
        uniqueId: generateUniqueId(24),
        depositTransactionId: deposit.id,
        fromStatus: String(oldStatus),
        toStatus: String(mappedStatus),
        changedBy: "system",
        changedByType: "system",
        changedAt: new Date(),
        meta: { source: "processingunit_webhook" },
    });

    if (mappedStatus !== oldStatus) {
        if (mappedStatus === DEPOSIT_TRANSACTION_COMPLETED) {
            await Dispatch.callback({
                userId: String(deposit.userId),
                eventType: CALLBACK_DEPOSIT_SUCCESS,
                payload: depositTransactionCallbackPayload(deposit),
                depositTransactionUniqueId: deposit.uniqueId,
            });
            if (depositUser && virtualAccount && depositUser.deviceToken) {
                void pushNotificationService
                    .sendToToken(depositUser.deviceToken, {
                        title: "Deposit Successful",
                        body: `Your deposit of ${normalizeDecimalString(deposit.totalAmount)} ${virtualAccount.currency} has been completed successfully.`,
                        data: {
                            content_unique_id: deposit.uniqueId,
                            status: "COMPLETED",
                            type: "deposit",
                        },
                    })
                    .catch((pushError) => {
                        // eslint-disable-next-line no-console
                        console.error(
                            "Failed to send successful deposit push notification:",
                            pushError,
                        );
                    });
            }
        } else if (
            [
                DEPOSIT_TRANSACTION_FAILED,
                DEPOSIT_TRANSACTION_REJECTED,
                DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
            ].includes(mappedStatus)
        ) {
            await Dispatch.callback({
                userId: String(deposit.userId),
                eventType: CALLBACK_DEPOSIT_FAILED,
                payload: depositTransactionCallbackPayload(deposit),
                depositTransactionUniqueId: deposit.uniqueId,
            });

            if (depositUser?.deviceToken) {
                void pushNotificationService
                    .sendToToken(depositUser.deviceToken, {
                        title: "Deposit Failed",
                        body: `Your deposit of ${normalizeDecimalString(deposit.totalAmount)} ${virtualAccount?.currency ?? ""} has failed.`,
                        data: {
                            content_unique_id: deposit.uniqueId,
                            status: "FAILED",
                            type: "deposit",
                        },
                    })
                    .catch((pushError) => {
                        // eslint-disable-next-line no-console
                        console.error(
                            "Failed to send failed deposit push notification:",
                            pushError,
                        );
                    });
            }
        }
    }

    // Mirror Helper::updateLedger — on COMPLETED, write a credit ledger
    // row keyed off the DepositTransaction polymorphic morph.
    if (mappedStatus === DEPOSIT_TRANSACTION_COMPLETED) {
        const existingLedger = await Ledger.findOne({
            where: {
                transactionType: MORPH_DEPOSIT_TRANSACTION,
                transactionId: deposit.id,
            },
        });
        if (!existingLedger) {
            if (!depositUser || !virtualAccount) {
                // eslint-disable-next-line no-console
                console.error(
                    `PU webhook: user or VA not found for deposit ledger record (${deposit.uniqueId})`,
                );
                return { depositTransactionId: deposit.id };
            }

            // The bank balance is scoped to the deposit's team member
            // when the deposit was raised by a corporate team member,
            // otherwise it sums across all team members of the user.
            let teamMemberContext: { role: number; id: number } | null = null;
            if (deposit.teamMemberId) {
                const teamMember = await TeamMember.findByPk(
                    deposit.teamMemberId,
                );
                if (teamMember) {
                    teamMemberContext = {
                        role: teamMember.role,
                        id: teamMember.id,
                    };
                }
            }
            const currentBalance = await computeBankBalance(
                depositUser,
                virtualAccount,
                teamMemberContext,
            );

            await Ledger.create({
                uniqueId: generateUniqueId(24),
                userId: deposit.userId,
                virtualAccountId: deposit.virtualAccountId,
                walletId: null,
                transactionType: MORPH_DEPOSIT_TRANSACTION,
                transactionId: deposit.id,
                balance: currentBalance.toString(),
                externalType:
                    deposit.externalType ?? EXTERNAL_TYPE_PROCESSING_UNIT,
                description: `Deposit ${deposit.uniqueId}`,
            });
        }
    }

    // eslint-disable-next-line no-console
    console.info(
        `DepositTransaction ${orderId} updated by PU webhook: ${oldStatus} -> ${mappedStatus}`,
    );

    return { depositTransactionId: deposit.id };
};

const handleVerifyBankAccount = async (
    data: Record<string, unknown>,
): Promise<{
    beneficiaryTransactionId: number | null;
    success: boolean;
    errorMessage: string | null;
}> => {
    const accountNumber = (data.account_number as string | undefined) ?? null;
    const ifscCode = (data.ifsc_code as string | undefined) ?? null;

    if (!accountNumber) {
        // eslint-disable-next-line no-console
        console.warn("PU webhook: missing account_number in verify_bank_account");
        return {
            beneficiaryTransactionId: null,
            success: true,
            errorMessage: null,
        };
    }

    // 1. Only cache validations for accounts we actually hold (the
    //    BeneficiaryAccount model is paranoid, so soft-deleted rows are
    //    excluded automatically — mirror of the legacy deletedAt:null).
    const beneficiaryExists = await BeneficiaryAccount.findOne({
        where: { accountNumber, swiftCode: ifscCode },
    });
    if (!beneficiaryExists) {
        // eslint-disable-next-line no-console
        console.info(
            `PU webhook: beneficiary account ${accountNumber} does not exist, skipping validation creation`,
        );
        return {
            beneficiaryTransactionId: null,
            success: true,
            errorMessage: null,
        };
    }

    // 2. Skip when a validation record already exists for this account.
    const validationExists = await BeneficiaryAccountValidation.findOne({
        where: { accountNumber },
    });
    if (validationExists) {
        // eslint-disable-next-line no-console
        console.info(
            `PU webhook: validation record already exists for ${accountNumber}, skipping creation`,
        );
        return {
            beneficiaryTransactionId: null,
            success: true,
            errorMessage: null,
        };
    }

    // Latest transaction for that account number + IFSC code.
    const latestTransaction = await BeneficiaryTransaction.findOne({
        include: [
            {
                model: BeneficiaryAccount,
                as: "beneficiaryAccount",
                where: { accountNumber, swiftCode: ifscCode },
                required: true,
                paranoid: false,
            },
        ],
        order: [["id", "DESC"]],
    });

    // Resolve the user_id for the validation record.
    let targetUserId: number | null = latestTransaction
        ? latestTransaction.userId
        : null;
    if (!targetUserId && data.merchant_email) {
        const matchedUser = await User.findOne({
            where: { email: String(data.merchant_email) },
        });
        if (matchedUser) {
            targetUserId = matchedUser.id;
        }
    }
    if (!targetUserId) {
        const fallbackUser = await User.findOne();
        if (fallbackUser) {
            targetUserId = fallbackUser.id;
        } else {
            // eslint-disable-next-line no-console
            console.warn(
                `PU webhook: no user found in system to associate with validation record for ${accountNumber}`,
            );
            return {
                beneficiaryTransactionId: null,
                success: false,
                errorMessage: "No user found in system",
            };
        }
    }

    // 3. Create the validation record.
    await BeneficiaryAccountValidation.create({
        uniqueId: generateUniqueId(24),
        userId: targetUserId,
        accountName: (data.account_name as string) ?? null,
        accountNumber: (data.account_number as string) ?? accountNumber,
        code: (data.ifsc_code as string) ?? ifscCode,
        validationService: "pu",
        externalReferenceId: (data.client_id as string) ?? null,
        externalStatus: (data.status as string) ?? null,
        externalData: data,
        remarks: (data.message as string) ?? null,
        isAccountExists:
            String(data.is_account_exists ?? "NO").toUpperCase() === "YES"
                ? 1
                : 0,
        isNreAccount:
            String(data.is_nre_account ?? "NO").toUpperCase() === "YES"
                ? 1
                : 0,
        status: 1,
    });

    // eslint-disable-next-line no-console
    console.info(
        `PU webhook: beneficiary account validation created for ${accountNumber}`,
    );

    return {
        beneficiaryTransactionId: latestTransaction
            ? latestTransaction.id
            : null,
        success: true,
        errorMessage: null,
    };
};

const handleCalizaVirtualAccount = async (
    data: Record<string, unknown>,
): Promise<{ success: boolean; errorMessage: string | null }> => {
    const externalUserId = (data.user_id as string | undefined) ?? null;
    const status = (data.status as string | undefined) ?? null;

    if (!externalUserId || !status) {
        // eslint-disable-next-line no-console
        console.warn(
            "PU webhook: missing user_id or status in caliza_virtual_account",
        );
        return { success: false, errorMessage: "Missing required fields" };
    }

    const virtualAccount = await VirtualAccount.findOne({
        where: {
            externalReferenceId: externalUserId,
            externalType: EXTERNAL_TYPE_CALIZA,
        },
    });
    if (!virtualAccount) {
        // eslint-disable-next-line no-console
        console.warn(
            `PU webhook: virtual account row not found for caliza_virtual_account ${externalUserId}`,
        );
        return { success: false, errorMessage: "Virtual account not found" };
    }

    if (!virtualAccount.userId) {
        // eslint-disable-next-line no-console
        console.warn("PU webhook: virtual account userId is null");
        return {
            success: false,
            errorMessage: "Virtual account userId is null",
        };
    }

    const isCreated =
        status.toUpperCase() === "CREATED" || status.toUpperCase() === "ACTIVE";
    const finalStatus = isCreated
        ? VIRTUAL_ACCOUNT_STATUS_CREATED
        : VIRTUAL_ACCOUNT_STATUS_FAILED;

    const updateData: Record<string, unknown> = {
        status: finalStatus,
        externalData: data,
    };
    if (isCreated) {
        updateData.accountNumber = (data.account_number as string) ?? null;
        updateData.accountHolderName =
            (data.account_holder_name as string) ?? null;
        updateData.accountBankName = (data.account_bank_name as string) ?? null;
        updateData.accountBankCode = (data.account_bank_code as string) ?? null;
        updateData.routingNumber = (data.routing_number as string) ?? null;
    }

    await virtualAccount.update(updateData);

    // eslint-disable-next-line no-console
    console.info(
        `VirtualAccount ${virtualAccount.id} updated by caliza_virtual_account webhook (status ${finalStatus})`,
    );

    if (finalStatus === VIRTUAL_ACCOUNT_STATUS_CREATED) {
        const callbackPayload = {
            unique_id: virtualAccount.uniqueId,
            account_number: virtualAccount.accountNumber ?? "",
            account_holder_name: virtualAccount.accountHolderName ?? "",
            account_bank_name: virtualAccount.accountBankName ?? "",
            account_bank_code: virtualAccount.accountBankCode ?? "",
            routing_number: virtualAccount.routingNumber ?? "",
            currency: virtualAccount.currency,
            country: virtualAccount.country,
            status: "CREATED",
        };

        await Dispatch.callback({
            userId: String(virtualAccount.userId),
            eventType: CALLBACK_VIRTUAL_ACCOUNT_CREATED,
            payload: callbackPayload,
        }).catch((dispatchError) => {
            // eslint-disable-next-line no-console
            console.error(
                `Failed to dispatch CALLBACK_VIRTUAL_ACCOUNT_CREATED for ${virtualAccount.uniqueId}:`,
                dispatchError,
            );
        });
    }

    return { success: true, errorMessage: null };
};

/**
 * POST /api/processingunit-webhook
 */
export const processingUnitWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const startedAt = Date.now();
    const data = (req.body ?? {}) as Record<string, unknown>;
    let beneficiaryTransactionId: number | null = null;
    let depositTransactionId: number | null = null;
    let success = true;
    let errorMessage: string | null = null;

    // eslint-disable-next-line no-console
    console.info("Processing Unit Webhook Received:", JSON.stringify(data));

    try {
        const moduleName = (data.module as string | undefined) ?? null;
        if (!moduleName) {
            // eslint-disable-next-line no-console
            console.warn("PU webhook: missing module");
            res.status(200).json({ received: true });
            return;
        }

        if (moduleName === "withdraw") {
            const result = await handleWithdraw(data);
            beneficiaryTransactionId = result.beneficiaryTransactionId;
            success = result.success;
            errorMessage = result.errorMessage;
        } else if (moduleName === "deposit") {
            const result = await handleDeposit(data);
            depositTransactionId = result.depositTransactionId;
        } else if (moduleName === "verify_bank_account") {
            const result = await handleVerifyBankAccount(data);
            beneficiaryTransactionId = result.beneficiaryTransactionId;
            success = result.success;
            errorMessage = result.errorMessage;
        } else if (moduleName === "caliza_virtual_account") {
            const result = await handleCalizaVirtualAccount(data);
            success = result.success;
            errorMessage = result.errorMessage;
        } else {
            // eslint-disable-next-line no-console
            console.warn(`Unknown module from Processing Unit: ${moduleName}`);
        }
    } catch (webhookError) {
        success = false;
        errorMessage =
            webhookError instanceof Error
                ? webhookError.message
                : String(webhookError);
        // eslint-disable-next-line no-console
        console.error("Processing Unit Webhook Failed:", webhookError);
    } finally {
        const durationMs = Date.now() - startedAt;
        ExternalServiceCall.create({
            externalType: EXTERNAL_TYPE_PROCESSING_UNIT,
            action: EXTERNAL_CALL_FOR_CALLBACK,
            method: "POST",
            endpoint: "ec-webhook",
            beneficiaryTransactionId,
            depositTransactionId,
            requestPayload: {},
            responsePayload: data,
            httpStatus: null,
            success,
            responseTimeMs: durationMs,
            externalReferenceId:
                (data.utr_number as string | undefined) ?? null,
            errorMessage: success ? null : errorMessage,
        }).catch((auditError) => {
            // eslint-disable-next-line no-console
            console.warn("PU webhook audit write failed:", auditError);
        });
    }

    res.status(200).json({ received: true });
};
