import { Job, JobsOptions } from "bullmq";
import {
    buildResponse,
    persistQuote,
    resolveSource,
    QuotePayload,
} from "../controller/quote.controller";
import { getBusinessModel } from "../helpers/merchant.helper";
import {
    findOrCreateBeneficiaryAccount,
    findOrCreateSender,
} from "../helpers/party_upsert.helper";
import {
    createPayoutTransaction,
    CreatorContext,
} from "../helpers/payout_transaction.helper";
import { NormalizedBeneficiaryPayload } from "../helpers/beneficiary_normalizer.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Merchant from "../models/merchant.model";
import PayoutJob from "../models/payout_job.model";
import Sender from "../models/sender.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import {
    createDeposit,
    make as makePayout,
} from "../services/processing_unit.service";
import {
    BUSINESS_MODEL_DEAL_BASED,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    PAYOUT_JOB_STATUS_COMPLETED,
    PAYOUT_JOB_STATUS_FAILED,
    PAYOUT_JOB_STATUS_PROCESSING,
    QUOTE_MODE_QUOTATION,
    QUOTE_TYPE_REVERSE,
} from "../utils/constants";
import { enqueue } from "./config";

/**
 * External-system job: every interaction with the Processing Unit API
 * (payouts, deposits, bulk payout orchestration) rides this single job,
 * discriminated by payload.action.
 */

export const PROCESSING_UNIT_JOB = "ProcessingUnit";

export interface ProcessingUnitPayload {
    action: "payout" | "deposit" | "bulk_payout";
    transactionId: string;
    userId: string;
    payoutJobUniqueId: string;
}

const dedupJobId = (payload: ProcessingUnitPayload): string => {
    switch (payload.action) {
        case "payout":
            return payload.transactionId
                ? `payout-${payload.transactionId}`
                : `payout-job-${payload.payoutJobUniqueId}`;
        case "deposit":
            return `deposit-${payload.transactionId}`;
        case "bulk_payout":
            return `bulk-${payload.payoutJobUniqueId}`;
    }
};

export const dispatchProcessingUnit = async (
    payload: ProcessingUnitPayload,
    options?: JobsOptions,
): Promise<string> =>
    enqueue(PROCESSING_UNIT_JOB, payload, {
        jobId: dedupJobId(payload),
        ...options,
    });

const handlePayout = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    const transaction = await BeneficiaryTransaction.findByPk(
        Number(payload.transactionId),
    );
    if (!transaction) {
        throw new Error(
            `Beneficiary transaction ${payload.transactionId} not found.`,
        );
    }
    const user = await User.findByPk(Number(payload.userId));
    if (!user) {
        throw new Error(`User ${payload.userId} not found.`);
    }

    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESSING_UNIT_JOB}] Started processing payout ${payload.transactionId}`,
    );

    try {
        await makePayout(transaction, user);
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] Successfully completed payout ${payload.transactionId}`,
        );
    } catch (serviceError) {
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] Payout ${payload.transactionId} failed:`,
            serviceError instanceof Error ? serviceError.message : serviceError,
        );
        throw serviceError;
    }
};

const handleDeposit = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(
        `[job:${PROCESSING_UNIT_JOB}] Started processing deposit ${payload.transactionId}`,
    );

    // The controller dispatches the row's unique_id; numeric ids are
    // still accepted for direct/legacy dispatches.
    const transaction = /^\d+$/.test(payload.transactionId)
        ? await DepositTransaction.findByPk(Number(payload.transactionId))
        : await DepositTransaction.findOne({
              where: { uniqueId: payload.transactionId },
          });
    if (!transaction) {
        throw new Error(
            `Deposit transaction ${payload.transactionId} not found.`,
        );
    }

    try {
        // Full ported ProcessingUnit initiation: payload build, upstream
        // call, status mapping + history, merchant callback enqueue.
        await createDeposit(transaction);
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] Successfully completed deposit ${payload.transactionId}`,
        );
    } catch (serviceError) {
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] Deposit ${payload.transactionId} failed:`,
            serviceError instanceof Error
                ? serviceError.message
                : serviceError,
        );
        throw serviceError;
    }
};

interface BulkPayoutJobPayload {
    beneficiary: NormalizedBeneficiaryPayload;
    remitter: Record<string, unknown> | null;
    transaction: {
        amount?: unknown;
        remarks?: string | null;
        txn_ref_no?: string | null;
    } | null;
    creator: string | null;
    source_type: string | null;
    source_id: string | null;
}

/**
 * One bulk row -> beneficiary/sender reuse-or-create, quote, payout
 * transaction (mirror of the legacy bulkPayoutHandler / Laravel
 * ProcessBulkPayout). Existing beneficiary and remitter records are
 * detected and reused — the lock-serialized upsert helpers guarantee
 * that even rows of the same batch racing through concurrent workers
 * never insert duplicates.
 */
const handleBulkPayout = async (
    payload: ProcessingUnitPayload,
): Promise<void> => {
    const payoutJob = await PayoutJob.findOne({
        where: { uniqueId: payload.payoutJobUniqueId },
    });
    if (!payoutJob) {
        throw new Error(
            `Payout job ${payload.payoutJobUniqueId} not found.`,
        );
    }
    if (payoutJob.status === PAYOUT_JOB_STATUS_COMPLETED) {
        return;
    }
    await payoutJob.update({
        status: PAYOUT_JOB_STATUS_PROCESSING,
        attempts: payoutJob.attempts + 1,
    });

    try {
        const user = await User.findByPk(payoutJob.userId);
        if (!user) {
            throw new Error(`User ${payoutJob.userId} not found.`);
        }
        const merchant = user.merchantId
            ? await Merchant.findByPk(user.merchantId)
            : null;

        // MariaDB persists JSON columns as longtext — depending on the
        // driver the payload can come back as a string.
        const rawPayload = payoutJob.payload;
        const jobPayload = (
            typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload
        ) as BulkPayoutJobPayload;

        // 1+2. Beneficiary / sender reuse-or-create.
        const beneficiaryAccount = await findOrCreateBeneficiaryAccount(
            user,
            jobPayload.beneficiary,
        );
        let senderRow: Sender | null = null;
        if (user.enableSender && jobPayload.remitter) {
            senderRow = await findOrCreateSender(user, jobPayload.remitter);
        }

        // 3. Funding source: the explicit source stored at upload time
        // wins; otherwise deal-based merchants fall back to the
        // matching-currency wallet and everyone else to the virtual
        // account.
        const quoteBody: QuotePayload = {
            amount: Number(payoutJob.amount ?? 0),
            recipient_type: "individual",
            recipient_country: beneficiaryAccount.country,
            receiving_currency: beneficiaryAccount.currency,
            quote_type: QUOTE_TYPE_REVERSE,
            payment_rail: beneficiaryAccount.paymentRail ?? undefined,
        };

        if (jobPayload.source_type === MORPH_WALLET && jobPayload.source_id) {
            const wallet = await Wallet.findByPk(
                Number(jobPayload.source_id),
            );
            if (wallet) {
                quoteBody.wallet_id = wallet.uniqueId;
            }
        } else if (
            jobPayload.source_type === MORPH_VIRTUAL_ACCOUNT &&
            jobPayload.source_id
        ) {
            const virtualAccount = await VirtualAccount.findByPk(
                Number(jobPayload.source_id),
            );
            if (virtualAccount) {
                quoteBody.bank_account_id = virtualAccount.uniqueId;
            }
        }

        if (!quoteBody.wallet_id && !quoteBody.bank_account_id) {
            if (user.merchantId) {
                const businessModel = await getBusinessModel(user.merchantId);
                if (
                    businessModel.toLowerCase() === BUSINESS_MODEL_DEAL_BASED
                ) {
                    const wallet = await Wallet.findOne({
                        where: {
                            userId: user.id,
                            currency:
                                beneficiaryAccount.currency.toUpperCase(),
                        },
                    });
                    if (wallet) {
                        quoteBody.wallet_id = wallet.uniqueId;
                    }
                }
            }
            if (!quoteBody.wallet_id) {
                const scope = await getVirtualAccountScope(user);
                const virtualAccount = await VirtualAccount.findOne({
                    where: scope as Record<string, unknown>,
                });
                if (!virtualAccount) {
                    throw new Error(
                        `No virtual account found for user: ${user.id}`,
                    );
                }
                quoteBody.bank_account_id = virtualAccount.uniqueId;
            }
        }

        // 4. Quote generation + persist.
        const source = await resolveSource(quoteBody, user);
        const quoteResponse = await buildResponse(
            quoteBody,
            source,
            user.id,
            merchant?.id ?? null,
            merchant?.type ?? null,
            QUOTE_MODE_QUOTATION,
            1,
        );
        const quote = await persistQuote(user.id, quoteResponse);

        // 5. Creator (team member) context.
        let creatorContext: CreatorContext | null = null;
        if (jobPayload.creator) {
            const teamMember = await TeamMember.findByPk(
                Number(jobPayload.creator),
            );
            if (teamMember) {
                creatorContext = {
                    id: teamMember.id,
                    role: teamMember.role,
                    senderId: teamMember.senderId,
                };
            }
        }

        // 6. Beneficiary transaction.
        const transactionData = jobPayload.transaction ?? {};
        const transaction = await createPayoutTransaction(
            {
                beneficiary_account_id: beneficiaryAccount.uniqueId,
                quote_id: quote.uniqueId,
                remitter_id: senderRow?.uniqueId,
                remarks: transactionData.remarks ?? undefined,
                txn_ref_no: transactionData.txn_ref_no ?? undefined,
                client_reference_id: transactionData.txn_ref_no
                    ? String(transactionData.txn_ref_no)
                    : undefined,
            },
            user,
            creatorContext,
        );

        await payoutJob.update({
            beneficiaryTransactionId: transaction.id,
            status: PAYOUT_JOB_STATUS_COMPLETED,
            errorMessage: null,
        });
        // eslint-disable-next-line no-console
        console.log(
            `[job:${PROCESSING_UNIT_JOB}] bulk payout ${payload.payoutJobUniqueId} completed (transaction ${transaction.uniqueId})`,
        );
    } catch (bulkError) {
        const errorMessage =
            bulkError instanceof Error ? bulkError.message : String(bulkError);
        await payoutJob
            .update({
                status: PAYOUT_JOB_STATUS_FAILED,
                errorMessage: errorMessage.slice(0, 1024),
            })
            .catch(() => undefined);
        // eslint-disable-next-line no-console
        console.error(
            `[job:${PROCESSING_UNIT_JOB}] bulk payout ${payload.payoutJobUniqueId} failed:`,
            errorMessage,
        );
        throw bulkError;
    }
};

export const executeProcessingUnit = async (job: Job): Promise<void> => {
    const payload = job.data as ProcessingUnitPayload;
    switch (payload.action) {
        case "payout":
            return handlePayout(payload);
        case "deposit":
            return handleDeposit(payload);
        case "bulk_payout":
            return handleBulkPayout(payload);
        default:
            throw new Error(
                `Unknown ProcessingUnit action "${String(
                    (payload as { action?: string }).action,
                )}".`,
            );
    }
};
