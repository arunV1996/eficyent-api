import Decimal from "decimal.js";
import { Request, Response } from "express";
import { Op, QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { computeBankBalance, getWalletBalance } from "../helpers/balance.helper";
import { CodedError } from "../helpers/coded_error.helper";
import { teamMemberContext } from "../helpers/team_context.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import Quote from "../models/quote.model";
import SupportedCountry from "../models/supported_country.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import {
    walletToJSON,
    walletTransactionToJSON,
} from "../resources/wallet.resource";
import { generateUniqueId, getFlagUrl } from "../utils/common.utils";
import {
    IDENTITY_VERIFICATION_COMPLETED,
    ONBOARDING_STEP_FOUR_COMPLETED,
    QUOTE_SUBMITTED,
    TAKE_COUNT,
    BUSINESS_MODEL_DEAL_BASED,
    TRANSACTION_TYPE_CREDIT,
    WALLET_STATUS_ACTIVE,
    WALLET_STATUS_MAP,
    WALLET_TRANSACTION_CANCELLED,
    WALLET_TRANSACTION_COMPLETED,
    WALLET_TRANSACTION_FAILED,
    WALLET_TRANSACTION_PENDING,
    WALLET_TRANSACTION_REJECTED,
} from "../utils/constants";

const APP_URL = process.env.APP_URL ?? "https://dev-eficyent.rare-able.com";

/**
 * Mirror of Api\WalletController + UserWalletRepository (via the
 * legacy walletController).
 *
 *   - `index` lazily provisions a wallet row for every
 *     supported-country currency in the user's service_providers list
 *     (create_all_wallets) before listing.
 *   - `convert` debits the source virtual account (via the linked
 *     quote) and credits the matching-currency wallet, marking the
 *     quote SUBMITTED — with FOR UPDATE locks on both rows.
 *
 * Team tokens flow through unchanged: /convert checks the balance
 * with the caller's team context (mirror of legacy).
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

/**
 * Mirror of UserWalletRepository::create_all_wallets.
 */
const createAllWallets = async (user: User): Promise<void> => {
    if (
        user.onboardingStep !== ONBOARDING_STEP_FOUR_COMPLETED &&
        user.idVerification !== IDENTITY_VERIFICATION_COMPLETED
    ) {
        return;
    }
    const baseScope = await getVirtualAccountScope(user);
    const virtualAccount = await VirtualAccount.findOne({
        where: baseScope as Record<string, unknown>,
    });
    if (!virtualAccount) {
        return;
    }

    const providers = Array.isArray(user.serviceProviders)
        ? (user.serviceProviders as string[])
        : [];
    if (providers.length === 0) {
        return;
    }

    const currencyRows = await SupportedCountry.findAll({
        where: { status: 1, externalType: { [Op.in]: providers } },
        attributes: [
            [sequelize.fn("DISTINCT", sequelize.col("currency")), "currency"],
        ],
        raw: true,
    });
    for (const { currency } of currencyRows as { currency: string }[]) {
        if (currency === "USD") {
            continue;
        }
        await Wallet.findOrCreate({
            where: { userId: user.id, currency },
            defaults: {
                uniqueId: generateUniqueId(24),
                userId: user.id,
                currency,
            },
        });
    }
};

const flagForCurrency = async (currency: string): Promise<string | null> => {
    const country = await SupportedCountry.findOne({
        where: { currency },
        attributes: ["countryCode"],
    });
    return country ? getFlagUrl(country.countryCode, APP_URL) : null;
};

/**
 * GET /api/user/wallets/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        await createAllWallets(req.user);

        const status =
            query.status && query.status in WALLET_STATUS_MAP
                ? WALLET_STATUS_MAP[query.status]
                : WALLET_STATUS_ACTIVE;

        const where: Record<string, unknown> = {
            userId: req.user.id,
            status,
        };
        if (query.currency) {
            where.currency = query.currency;
        }
        if (query.search_key) {
            where.currency = { [Op.like]: `%${query.search_key}%` };
        }
        const dealBased = query.deal_based as unknown;
        if (
            dealBased === true ||
            dealBased === "true" ||
            dealBased === 1 ||
            dealBased === "1"
        ) {
            where.businessModel = BUSINESS_MODEL_DEAL_BASED;
        }

        const rows = await Wallet.findAll({ where });
        const withBalance = await Promise.all(
            rows.map(async (wallet) => {
                const balance = await getWalletBalance(req.user!, wallet);
                const flag = await flagForCurrency(wallet.currency);
                return { wallet, balance, flag };
            }),
        );

        let sorted = withBalance.sort((left, right) =>
            right.balance.minus(left.balance).toNumber(),
        );
        if (query.only_with_balance === "true") {
            sorted = sorted.filter((entry) => entry.balance.gt(0));
        }

        const total = sorted.length;
        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;
        const page = sorted.slice(skip, skip + take);

        return res.sendResponse(
            {
                total,
                wallets: page.map((entry) => {
                    const shaped = entry.wallet as Wallet & {
                        balance?: string;
                        flag?: string | null;
                    };
                    shaped.balance = entry.balance.toString();
                    shaped.flag = entry.flag;
                    return walletToJSON(shaped, req.user?.timezone);
                }),
            },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/wallets/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const walletUniqueId = req.query.wallet_id as string | undefined;
        if (!walletUniqueId) {
            return res.sendError("Wallet not found.", 167, 400);
        }

        const wallet = await Wallet.findOne({
            where: {
                userId: req.user.id,
                uniqueId: walletUniqueId,
                status: WALLET_STATUS_ACTIVE,
            },
        });
        if (!wallet) {
            return res.sendError("Wallet not found.", 167, 400);
        }
        const balance = await getWalletBalance(req.user, wallet);
        const flag = await flagForCurrency(wallet.currency);

        const shaped = wallet as Wallet & {
            balance?: string;
            flag?: string | null;
        };
        shaped.balance = balance.toString();
        shaped.flag = flag;

        return res.sendResponse(
            { wallet: walletToJSON(shaped, req.user.timezone) },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/wallets/convert
 */
export const convert = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        // Mirror Laravel: Quote::where('unique_id', ...)->first() — no
        // userId scoping.
        const quote = await Quote.findOne({
            where: { uniqueId: req.body.quote_id },
        });
        if (!quote || !quote.receivingCurrency) {
            return res.sendError("Quote not found.", 121, 400);
        }

        const wallet = await Wallet.findOne({
            where: {
                userId: req.user.id,
                currency: quote.receivingCurrency,
            },
        });
        if (!wallet) {
            return res.sendError("Wallet not found.", 167, 400);
        }
        if (wallet.status !== WALLET_STATUS_ACTIVE) {
            return res.sendError("Wallet is not active.", 169, 400);
        }

        // Source-balance check (mirror Helper::bankBalance).
        if (!quote.sourceId) {
            return res.sendError("Bank account not found.", 120, 400);
        }
        const baseScope = await getVirtualAccountScope(req.user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                id: quote.sourceId,
            },
        });
        if (!virtualAccount) {
            return res.sendError("Bank account not found.", 120, 400);
        }
        const checkBalance = await computeBankBalance(
            req.user,
            virtualAccount,
            teamMemberContext(req),
        );
        if (new Decimal(quote.amount).gt(checkBalance)) {
            return res.sendError("Insufficient balance.", 154, 400);
        }

        const randomPart = Math.floor(Math.random() * 900) + 100;
        const now = new Date();
        const datePart =
            now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0");
        const fxPart = (quote.fxRate || "").replace(/\./g, "");
        const transactionIdString = `${randomPart}${datePart}${fxPart}`;

        const walletTransaction = await sequelize.transaction(
            async (databaseTransaction) => {
                // Pessimistic locks on the source virtual account and
                // the destination wallet to serialize concurrent
                // conversions.
                await sequelize.query(
                    "SELECT id FROM virtual_accounts WHERE id = ? FOR UPDATE",
                    {
                        replacements: [virtualAccount.id],
                        type: QueryTypes.SELECT,
                        transaction: databaseTransaction,
                    },
                );
                await sequelize.query(
                    "SELECT id FROM wallets WHERE id = ? FOR UPDATE",
                    {
                        replacements: [wallet.id],
                        type: QueryTypes.SELECT,
                        transaction: databaseTransaction,
                    },
                );

                const created = await WalletTransaction.create(
                    {
                        uniqueId: generateUniqueId(24),
                        transactionId: transactionIdString,
                        userId: req.user!.id,
                        walletId: wallet.id,
                        quoteId: quote.id,
                        amount: quote.receivingAmount,
                        totalAmount: quote.receivingAmount,
                        fees: quote.commissionAmount,
                        status: WALLET_TRANSACTION_PENDING,
                        type: TRANSACTION_TYPE_CREDIT,
                        balanceBefore: null,
                        balanceAfter: null,
                    },
                    { transaction: databaseTransaction },
                );
                await Quote.update(
                    { status: QUOTE_SUBMITTED },
                    {
                        where: { id: quote.id },
                        transaction: databaseTransaction,
                    },
                );
                return created;
            },
        );

        // Attach the relations the resource shaper reads (mirror of
        // the legacy wtWithRelations spread).
        (walletTransaction as { wallet?: Wallet }).wallet = wallet;
        (quote as { virtual_accounts?: VirtualAccount }).virtual_accounts =
            virtualAccount;
        (walletTransaction as { quote?: Quote }).quote = quote;

        return res.sendResponse(
            {
                wallet_transaction: walletTransactionToJSON(
                    walletTransaction,
                    req.user.timezone,
                ),
            },
            res.__("success.108"),
            108,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/wallets/transactions/list
 */
export const transactions = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;

        // Status accepts the numeric value or a label token (mirror of
        // the legacy branchy filter).
        let statusFilter: number | number[] | undefined;
        if (query.status !== undefined) {
            if (
                query.status.trim() !== "" &&
                !Number.isNaN(Number(query.status))
            ) {
                statusFilter = Number(query.status);
            } else {
                const statusToken = String(query.status).toUpperCase();
                if (statusToken === "PENDING") {
                    statusFilter = WALLET_TRANSACTION_PENDING;
                } else if (statusToken === "COMPLETED") {
                    statusFilter = WALLET_TRANSACTION_COMPLETED;
                } else if (statusToken === "FAILED") {
                    statusFilter = [
                        WALLET_TRANSACTION_FAILED,
                        WALLET_TRANSACTION_REJECTED,
                        WALLET_TRANSACTION_CANCELLED,
                    ];
                } else if (statusToken === "REJECTED") {
                    statusFilter = WALLET_TRANSACTION_REJECTED;
                } else if (statusToken === "CANCELLED") {
                    statusFilter = WALLET_TRANSACTION_CANCELLED;
                }
            }
        }

        const where: Record<string, unknown> = {
            userId: req.user.id,
            beneficiaryTransactionId: null,
        };
        if (query.transaction_type !== undefined) {
            where.type = Number(query.transaction_type);
        }
        if (statusFilter !== undefined) {
            where.status = Array.isArray(statusFilter)
                ? { [Op.in]: statusFilter }
                : statusFilter;
        }
        if (query.search_key) {
            where.uniqueId = { [Op.like]: `%${query.search_key}%` };
        }
        if (query.wallet_id) {
            const wallet = await Wallet.findOne({
                where: { uniqueId: query.wallet_id, userId: req.user.id },
            });
            if (!wallet) {
                return res.sendError("Wallet not found.", 167, 400);
            }
            where.walletId = wallet.id;
        }
        if (query.from_date && query.to_date) {
            where.createdAt = {
                [Op.gte]: new Date(`${query.from_date}T00:00:00Z`),
                [Op.lte]: new Date(`${query.to_date}T23:59:59Z`),
            };
        }

        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;

        const include = [
            { model: Wallet, as: "wallet", required: false },
            {
                model: Quote,
                as: "quote",
                required: false,
                include: [
                    {
                        model: VirtualAccount,
                        as: "virtual_accounts",
                        required: false,
                    },
                ],
            },
        ];
        const [total, rows] = await Promise.all([
            WalletTransaction.count({ where }),
            WalletTransaction.findAll({
                where,
                include,
                order: [["created_at", "DESC"]],
                offset: skip,
                limit: take,
            }),
        ]);

        return res.sendResponse(
            {
                total,
                wallet_transactions: rows.map((row) =>
                    walletTransactionToJSON(row, req.user?.timezone),
                ),
            },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/wallets/transactions/show
 */
export const showTransaction = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const row = await WalletTransaction.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.query.wallet_transaction_id),
            },
            include: [
                { model: Wallet, as: "wallet", required: false },
                {
                    model: Quote,
                    as: "quote",
                    required: false,
                    include: [
                        {
                            model: VirtualAccount,
                            as: "virtual_accounts",
                            required: false,
                        },
                    ],
                },
            ],
        });
        if (!row) {
            return res.sendError("Not found.", 404, 404);
        }
        return res.sendResponse(
            {
                wallet_transaction: walletTransactionToJSON(
                    row,
                    req.user.timezone,
                ),
            },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
