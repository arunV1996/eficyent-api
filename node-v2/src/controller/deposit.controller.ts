import { Request, Response } from "express";
import { Op } from "sequelize";
import sequelize from "../config/database";
import { CodedError } from "../helpers/coded_error.helper";
import { calcDepositCommissions } from "../helpers/commission.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import AdminWallet from "../models/admin_wallet.model";
import DepositTransaction from "../models/deposit_transaction.model";
import DepositTransactionStatusHistory from "../models/deposit_transaction_status_history.model";
import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import { depositTransactionToJSON } from "../resources/deposit_transaction.resource";
import { uploadBase64 } from "../services/s3.service";
import { generateUniqueId } from "../utils/common.utils";
import {
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_PENDING,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
    DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
    DEPOSIT_TRANSACTION_REJECTED,
    DEPOSIT_TYPE_MAP,
    DEPOSIT_TYPE_TOPUP,
    TAKE_COUNT,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

const USER_DOCUMENT_FILE_PATH = "user_documents";

/**
 * Mirror of Api\DepositController + DepositTransactionRepository (via
 * the legacy depositController).
 *
 * Deposits respond with the legacy "empty envelope"
 * ({success, message, code: "", data}) — res.sendEmptyEnvelope.
 *
 * Deferred (documented):
 *   - GET /deposits/export (puppeteer/EJS PDF + XLSX export)
 *   - public POST /retry_deposit/{trxn} (needs the ProcessingUnit
 *     deposit client)
 *   - the best-effort post-store dispatch fan-out (Telegram notifier,
 *     ProcessingUnit createDeposit, InvoiceMate makeDeposit) — arrives
 *     with the provider-clients tranche; it never affected the HTTP
 *     response (fire-and-forget in legacy).
 *   - team-member token context (req.teamMember) — team module tranche.
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

/**
 * Mirror of the legacy generateUserMemo: 3-char prefix from the name
 * (personal users) or email + 4 random digits.
 */
const generateUserMemo = (user: User): string => {
    const name =
        Number(user.userType) === USER_TYPE_PERSONAL
            ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
            : "";
    const prefix = (name || user.email).slice(0, 3).toUpperCase();
    const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    return `${prefix}${suffix}`;
};

/**
 * Shared status-token resolution for list/export filters (mirror of
 * the legacy branch: PROCESSING covers pending + both PU states,
 * FAILED covers failed/rejected/PU-failed).
 */
const resolveStatusFilter = (
    statusToken: string | undefined,
): number | number[] | undefined => {
    if (!statusToken) {
        return undefined;
    }
    const normalized = statusToken.toUpperCase();
    if (normalized === "PROCESSING") {
        return [
            DEPOSIT_TRANSACTION_PENDING,
            DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
            DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        ];
    }
    if (normalized === "FAILED") {
        return [
            DEPOSIT_TRANSACTION_FAILED,
            DEPOSIT_TRANSACTION_REJECTED,
            DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED,
        ];
    }
    if (normalized === "COMPLETED") {
        return DEPOSIT_TRANSACTION_COMPLETED;
    }
    return undefined;
};

/**
 * GET /api/user/deposits/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const statusFilter = resolveStatusFilter(query.status);

        let virtualAccountId: number | null = null;
        if (query.bank_account_id) {
            const baseScope = await getVirtualAccountScope(req.user);
            const virtualAccount = await VirtualAccount.findOne({
                where: {
                    ...(baseScope as Record<string, unknown>),
                    uniqueId: query.bank_account_id,
                },
            });
            if (!virtualAccount) {
                return res.sendError("Bank account not found.", 120, 400);
            }
            virtualAccountId = virtualAccount.id;
        }

        const where: Record<string, unknown> = { userId: req.user.id };
        if (statusFilter !== undefined) {
            where.status = Array.isArray(statusFilter)
                ? { [Op.in]: statusFilter }
                : statusFilter;
        }
        if (virtualAccountId !== null) {
            where.virtualAccountId = virtualAccountId;
        }
        if (query.type) {
            where.type = query.type;
        }
        if (query.from_date && query.to_date) {
            where.createdAt = {
                [Op.gte]: new Date(`${query.from_date}T00:00:00Z`),
                [Op.lte]: new Date(`${query.to_date}T23:59:59Z`),
            };
        }
        if (query.search_key) {
            const searchTerm = `%${query.search_key}%`;
            where[Op.or as unknown as string] = [
                { uniqueId: { [Op.like]: searchTerm } },
                { externalReferenceId: { [Op.like]: searchTerm } },
            ];
        }

        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;
        const [total, rows] = await Promise.all([
            DepositTransaction.count({ where }),
            DepositTransaction.findAll({
                where,
                order: [["created_at", "DESC"]],
                offset: skip,
                limit: take,
            }),
        ]);

        const depositTransactions = [];
        for (const row of rows) {
            depositTransactions.push(await depositTransactionToJSON(row));
        }

        return res.sendEmptyEnvelope(
            { total, deposit_transactions: depositTransactions },
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/deposits/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const row = await DepositTransaction.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.query.deposit_transaction_id),
            },
        });
        if (!row) {
            return res.sendError("Transaction not found.", 124, 400);
        }
        return res.sendEmptyEnvelope(
            { deposit_transaction: await depositTransactionToJSON(row) },
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/deposits/quote — read-only commission preview.
 */
export const quote = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const baseScope = await getVirtualAccountScope(req.user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: query.bank_account_id,
            },
        });
        if (!virtualAccount) {
            return res.sendError("Bank account not found.", 120, 400);
        }
        const merchant = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const currency = (
            query.deposit_currency ?? virtualAccount.currency
        ).toUpperCase();
        const commissions = await calcDepositCommissions(
            {
                userId: req.user.id,
                merchantId: merchant?.id ?? null,
                merchantType: merchant?.type ?? null,
            },
            Number(query.amount),
            currency,
        );
        const totalFees =
            commissions.commission_amount +
            commissions.merchant_commission_amount;

        return res.sendEmptyEnvelope(
            {
                quote: {
                    amount: String(Number(query.amount)),
                    total_fees: totalFees,
                    receiving_amount: Number(query.amount) - totalFees,
                    deposit_currency: currency,
                },
            },
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/deposits/store
 */
export const store = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const body = req.body as Record<string, unknown>;

        const baseScope = await getVirtualAccountScope(req.user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: String(body.bank_account_id),
            },
        });
        if (!virtualAccount) {
            return res.sendError("Bank account not found.", 120, 400);
        }

        const merchant = req.user.merchantId
            ? await Merchant.findByPk(req.user.merchantId)
            : null;
        const currency = (
            (body.deposit_currency as string | undefined) ??
            virtualAccount.currency
        ).toUpperCase();
        const commissions = await calcDepositCommissions(
            {
                userId: req.user.id,
                merchantId: merchant?.id ?? null,
                merchantType: merchant?.type ?? null,
            },
            Number(body.amount),
            currency,
        );
        const totalCommission =
            commissions.commission_amount +
            commissions.merchant_commission_amount;

        let proofUrl: string | null = null;
        if (body.proof) {
            const proofInput = String(body.proof);
            proofUrl = proofInput.startsWith("data:")
                ? await uploadBase64(proofInput, USER_DOCUMENT_FILE_PATH)
                : proofInput;
            if (!proofUrl) {
                return res.sendError("File upload failed.", 109, 400);
            }
        }

        let adminWalletId: number | null = null;
        if (body.to_wallet_id) {
            const adminWallet = await AdminWallet.findOne({
                where: { uniqueId: String(body.to_wallet_id) },
                paranoid: false,
            });
            if (!adminWallet) {
                return res.sendError("Admin wallet not found.", 202, 400);
            }
            adminWalletId = adminWallet.id;

            if (
                (currency === "USDT" || currency === "USDC") &&
                body.from_wallet_address &&
                String(body.from_wallet_address).toLowerCase().trim() ===
                    adminWallet.walletAddress.toLowerCase().trim()
            ) {
                return res.sendError(
                    "From wallet and to wallet cannot be the same.",
                    422,
                    422,
                );
            }
        }

        const memo = req.user.memo ?? generateUserMemo(req.user);
        if (!req.user.memo) {
            await User.update({ memo }, { where: { id: req.user.id } });
        }

        const depositType = body.type
            ? DEPOSIT_TYPE_MAP[String(body.type)] ?? DEPOSIT_TYPE_TOPUP
            : DEPOSIT_TYPE_TOPUP;

        const created = await sequelize.transaction(
            async (databaseTransaction) => {
                const deposit = await DepositTransaction.create(
                    {
                        uniqueId: generateUniqueId(24),
                        userId: req.user!.id,
                        teamMemberId: null,
                        virtualAccountId: virtualAccount.id,
                        adminWalletId,
                        amount: String(body.amount),
                        commissionAmount: String(
                            commissions.commission_amount,
                        ),
                        merchantCommissionAmount: String(
                            commissions.merchant_commission_amount,
                        ),
                        totalCommissionAmount: String(totalCommission),
                        totalAmount: String(
                            Number(body.amount) - totalCommission,
                        ),
                        memo,
                        externalType: virtualAccount.externalType ?? null,
                        clientReferenceId:
                            (body.client_reference_id as string | undefined) ??
                            null,
                        status: DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
                        type: depositType,
                        sourceOfFunds:
                            (body.source_of_funds as string | undefined) ??
                            null,
                        purposeOfPayment:
                            (body.purpose_of_payment as string | undefined) ??
                            null,
                        proof: proofUrl,
                        depositCurrency:
                            (body.deposit_currency as string | undefined) ??
                            null,
                        fromWalletAddress:
                            (body.from_wallet_address as string | undefined) ??
                            null,
                        transactionHash:
                            (body.transaction_hash as string | undefined) ??
                            null,
                    },
                    { transaction: databaseTransaction },
                );
                await DepositTransactionStatusHistory.create(
                    {
                        uniqueId: generateUniqueId(24),
                        depositTransactionId: deposit.id,
                        fromStatus: null,
                        toStatus: String(
                            DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
                        ),
                        changedBy: String(req.user!.id),
                        changedByType: "user",
                        changedAt: new Date(),
                    },
                    { transaction: databaseTransaction },
                );
                return deposit;
            },
        );

        // Deferred to the provider-clients tranche: the legacy
        // fire-and-forget dispatch fan-out (TelegramNotifier,
        // ProcessingUnit.createDeposit, InvoiceMate.makeDeposit) —
        // it never affected this response.

        return res.sendEmptyEnvelope(
            {
                deposit_transaction: await depositTransactionToJSON(created),
            },
            "Deposit successful.",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
