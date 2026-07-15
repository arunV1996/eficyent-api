import { Request, Response } from "express";
import { Includeable, Op } from "sequelize";
import { CodedError } from "../helpers/coded_error.helper";
import {
    formatReportDate,
    loadLogoDataUrl,
    renderPdfFromHtml,
    renderViewTemplate,
} from "../helpers/pdf_export.helper";
import {
    teamMemberContext,
    TeamRequestContext,
} from "../helpers/team_context.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryTransaction from "../models/beneficiary_transaction.model";
import DepositTransaction from "../models/deposit_transaction.model";
import Ledger from "../models/ledger.model";
import Quote from "../models/quote.model";
import User from "../models/user.model";
import VirtualAccount from "../models/virtual_account.model";
import Wallet from "../models/wallet.model";
import WalletTransaction from "../models/wallet_transaction.model";
import {
    EnrichedLedger,
    ledgerToJSON,
} from "../resources/ledger.resource";
import { generateExcel } from "../services/excel_export.service";
import { temporaryUrl, upload } from "../services/s3.service";
import {
    DEPOSIT_TRANSACTION_COMPLETED,
    MORPH_BENEFICIARY_TRANSACTION,
    MORPH_DEPOSIT_TRANSACTION,
    MORPH_VIRTUAL_ACCOUNT,
    MORPH_WALLET,
    MORPH_WALLET_TRANSACTION,
    TAKE_COUNT,
    TEAM_MEMBER_ROLE_CORPORATE,
    TRANSACTION_TYPE_CREDIT,
    TRANSACTION_TYPE_DEBIT,
    TRANSACTION_TYPE_MAP,
} from "../utils/constants";

/**
 * Mirror of Api\LedgerController + LedgerRepository (via the legacy
 * ledgerController). The polymorphic transaction_type column maps
 * CREDIT to deposit rows and DEBIT to beneficiary-transaction rows,
 * with wallet-transaction rows recognised on both sides.
 *
 * CORPORATE team members get their own scoped view: deposits/payouts
 * are narrowed to the member and the running balance is rebuilt from
 * the member's own credit/debit timeline (mirror of legacy).
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

const ledgerIncludes = (): Includeable[] => [
    { model: Wallet, as: "wallet", required: false },
    { model: VirtualAccount, as: "virtualAccount", required: false },
    {
        model: User,
        as: "users",
        required: false,
        attributes: ["timezone"],
    },
];

/**
 * Mirror of the legacy loadTransaction: attaches the polymorphic
 * transaction row (and, for beneficiary rows on a wallet ledger, the
 * paired debit wallet-transaction) plus the recursively-enriched
 * refund ledger.
 */
const loadTransaction = async (ledger: Ledger): Promise<EnrichedLedger> => {
    const enriched = ledger as EnrichedLedger;

    let refundLedgerEnriched: EnrichedLedger | null = null;
    if (ledger.refundLedgerId) {
        const refundLedger = await Ledger.findByPk(ledger.refundLedgerId);
        if (refundLedger) {
            refundLedgerEnriched = await loadTransaction(refundLedger);
        }
    }
    enriched.refundLedger = refundLedgerEnriched;

    if (!ledger.transactionType || !ledger.transactionId) {
        return enriched;
    }
    switch (ledger.transactionType) {
        case MORPH_DEPOSIT_TRANSACTION: {
            enriched.transaction = await DepositTransaction.findByPk(
                ledger.transactionId,
            );
            return enriched;
        }
        case MORPH_BENEFICIARY_TRANSACTION: {
            enriched.transaction = await BeneficiaryTransaction.findByPk(
                ledger.transactionId,
                {
                    include: [
                        {
                            model: BeneficiaryAccount,
                            as: "beneficiaryAccount",
                            required: false,
                            paranoid: false,
                        },
                    ],
                },
            );
            if (ledger.walletId) {
                enriched.walletTransaction = await WalletTransaction.findOne({
                    where: {
                        beneficiaryTransactionId: ledger.transactionId,
                        type: TRANSACTION_TYPE_DEBIT,
                    },
                });
            }
            return enriched;
        }
        case MORPH_WALLET_TRANSACTION: {
            enriched.transaction = await WalletTransaction.findByPk(
                ledger.transactionId,
                {
                    include: [
                        { model: Quote, as: "quote", required: false },
                        { model: Wallet, as: "wallet", required: false },
                    ],
                },
            );
            return enriched;
        }
        default:
            return enriched;
    }
};

interface LedgerListQuery {
    from_date?: string;
    to_date?: string;
    transaction_type?: string;
    search_key?: string;
    bank_account_id?: string;
    wallet_id?: string;
    receiving_currency?: string;
}

const idList = (rows: { id: number }[]): number[] => rows.map((row) => row.id);

/**
 * Shared where-builder for the ledgers list and export endpoints (the
 * legacy controller duplicates this filter block between index() and
 * export(); factoring it keeps the two in lock-step).
 */
const buildLedgerListWhere = async (
    req: Request,
    user: User,
    query: LedgerListQuery,
): Promise<{
    where: Record<string | symbol, unknown>;
    corporate: TeamRequestContext | null;
    isCorporate: boolean;
}> => {
    const transactionType = query.transaction_type
        ? TRANSACTION_TYPE_MAP[query.transaction_type]
        : undefined;

    const where: Record<string | symbol, unknown> = {
        userId: user.id,
    };
    const andConditions: Record<string | symbol, unknown>[] = [];

    if (query.bank_account_id) {
        const baseScope = await getVirtualAccountScope(user);
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: query.bank_account_id,
            },
        });
        if (virtualAccount) {
            where.virtualAccountId = virtualAccount.id;
        } else {
            where.id = -1; // mirror Laravel `whereRaw('1 = 0')`
        }
    }
    if (query.wallet_id) {
        const wallet = await Wallet.findOne({
            where: { uniqueId: query.wallet_id, userId: user.id },
        });
        if (wallet) {
            where.walletId = wallet.id;
        } else {
            where.id = -1;
        }
    }
    if (query.from_date && query.to_date) {
        where.createdAt = {
            [Op.gte]: new Date(`${query.from_date}T00:00:00Z`),
            [Op.lte]: new Date(`${query.to_date}T23:59:59Z`),
        };
    }

    if (
        transactionType === TRANSACTION_TYPE_CREDIT ||
        transactionType === TRANSACTION_TYPE_DEBIT
    ) {
        // Legacy quirk preserved: when a bank account is selected,
        // the wallet-transaction type flips (a wallet CREDIT is a
        // DEBIT from the bank account's perspective).
        let walletTransactionType = transactionType;
        if (query.bank_account_id) {
            walletTransactionType =
                transactionType === TRANSACTION_TYPE_CREDIT
                    ? TRANSACTION_TYPE_DEBIT
                    : TRANSACTION_TYPE_CREDIT;
        }

        const walletTransactionIds = idList(
            (await WalletTransaction.findAll({
                where: {
                    type: walletTransactionType,
                    userId: user.id,
                },
                attributes: ["id"],
                raw: true,
            })) as unknown as { id: number }[],
        );
        const primaryMorph =
            transactionType === TRANSACTION_TYPE_CREDIT
                ? MORPH_DEPOSIT_TRANSACTION
                : MORPH_BENEFICIARY_TRANSACTION;

        if (walletTransactionIds.length > 0) {
            andConditions.push({
                [Op.or]: [
                    { transactionType: primaryMorph },
                    {
                        transactionType: MORPH_WALLET_TRANSACTION,
                        transactionId: {
                            [Op.in]: walletTransactionIds,
                        },
                    },
                ],
            });
        } else {
            where.transactionType = primaryMorph;
        }
    }

    // receiving_currency narrows to the transactions whose currency
    // matches, across all three polymorphic tables.
    const allowedTransactions = {
        depositIds: [] as number[],
        beneficiaryIds: [] as number[],
        walletTransactionIds: [] as number[],
        filterApplied: false,
    };
    if (query.receiving_currency) {
        allowedTransactions.filterApplied = true;
        const [depositRows, beneficiaryRows, walletRows] =
            await Promise.all([
                DepositTransaction.findAll({
                    where: {
                        userId: user.id,
                        depositCurrency: query.receiving_currency,
                    },
                    attributes: ["id"],
                    raw: true,
                }),
                BeneficiaryTransaction.findAll({
                    where: {
                        userId: user.id,
                        receivingCurrency: query.receiving_currency,
                    },
                    attributes: ["id"],
                    raw: true,
                }),
                WalletTransaction.findAll({
                    where: { userId: user.id },
                    include: [
                        {
                            model: Quote,
                            as: "quote",
                            where: {
                                receivingCurrency:
                                    query.receiving_currency,
                            },
                            required: true,
                            attributes: [],
                        },
                    ],
                    attributes: ["id"],
                    raw: true,
                }),
            ]);
        allowedTransactions.depositIds = idList(
            depositRows as unknown as { id: number }[],
        );
        allowedTransactions.beneficiaryIds = idList(
            beneficiaryRows as unknown as { id: number }[],
        );
        allowedTransactions.walletTransactionIds = idList(
            walletRows as unknown as { id: number }[],
        );
    }

    if (query.search_key) {
        const searchTerm = `%${query.search_key}%`;
        const depositSearchWhere: Record<string, unknown> = {
            uniqueId: { [Op.like]: searchTerm },
            userId: user.id,
        };
        const beneficiarySearchWhere: Record<string, unknown> = {
            uniqueId: { [Op.like]: searchTerm },
            userId: user.id,
        };
        const walletSearchWhere: Record<string, unknown> = {
            uniqueId: { [Op.like]: searchTerm },
            userId: user.id,
        };
        if (allowedTransactions.filterApplied) {
            depositSearchWhere.id = {
                [Op.in]: allowedTransactions.depositIds,
            };
            beneficiarySearchWhere.id = {
                [Op.in]: allowedTransactions.beneficiaryIds,
            };
            walletSearchWhere.id = {
                [Op.in]: allowedTransactions.walletTransactionIds,
            };
        }

        const [depositIds, beneficiaryIds, walletTransactionIds] =
            await Promise.all([
                DepositTransaction.findAll({
                    where: depositSearchWhere,
                    attributes: ["id"],
                    raw: true,
                }),
                BeneficiaryTransaction.findAll({
                    where: beneficiarySearchWhere,
                    attributes: ["id"],
                    raw: true,
                }),
                WalletTransaction.findAll({
                    where: walletSearchWhere,
                    attributes: ["id"],
                    raw: true,
                }),
            ]);

        where[Op.or] = [
            { uniqueId: { [Op.like]: searchTerm } },
            ...(depositIds.length > 0
                ? [
                      {
                          transactionType: MORPH_DEPOSIT_TRANSACTION,
                          transactionId: {
                              [Op.in]: idList(
                                  depositIds as unknown as {
                                      id: number;
                                  }[],
                              ),
                          },
                      },
                  ]
                : []),
            ...(beneficiaryIds.length > 0
                ? [
                      {
                          transactionType: MORPH_BENEFICIARY_TRANSACTION,
                          transactionId: {
                              [Op.in]: idList(
                                  beneficiaryIds as unknown as {
                                      id: number;
                                  }[],
                              ),
                          },
                      },
                  ]
                : []),
            ...(walletTransactionIds.length > 0
                ? [
                      {
                          transactionType: MORPH_WALLET_TRANSACTION,
                          transactionId: {
                              [Op.in]: idList(
                                  walletTransactionIds as unknown as {
                                      id: number;
                                  }[],
                              ),
                          },
                      },
                  ]
                : []),
        ];
    } else if (allowedTransactions.filterApplied) {
        where[Op.or] = [
            {
                transactionType: MORPH_DEPOSIT_TRANSACTION,
                transactionId: {
                    [Op.in]: allowedTransactions.depositIds,
                },
            },
            {
                transactionType: MORPH_BENEFICIARY_TRANSACTION,
                transactionId: {
                    [Op.in]: allowedTransactions.beneficiaryIds,
                },
            },
            {
                transactionType: MORPH_WALLET_TRANSACTION,
                transactionId: {
                    [Op.in]: allowedTransactions.walletTransactionIds,
                },
            },
        ];
    }

    const corporate = teamMemberContext(req);
    const isCorporate =
        corporate !== null &&
        corporate.role === TEAM_MEMBER_ROLE_CORPORATE;
    if (isCorporate) {
        // Resolve the filtered source ids so the corporate arms
        // stay consistent with the root where.
        let corporateVaId: number | undefined;
        let corporateWalletId: number | undefined;
        if (query.bank_account_id) {
            const baseScope = await getVirtualAccountScope(user);
            const virtualAccount = await VirtualAccount.findOne({
                where: {
                    ...(baseScope as Record<string, unknown>),
                    uniqueId: query.bank_account_id,
                },
            });
            if (virtualAccount) {
                corporateVaId = virtualAccount.id;
            }
        }
        if (query.wallet_id) {
            const wallet = await Wallet.findOne({
                where: {
                    uniqueId: query.wallet_id,
                    userId: user.id,
                },
            });
            if (wallet) {
                corporateWalletId = wallet.id;
            }
        }

        // Deposits scoped to the filtered VA + member; payouts are
        // ALL of the member's payouts regardless of source
        // (wallet-sourced payouts carry walletId, not the USD
        // virtualAccountId — a source filter would hide them).
        const [depositRows, beneficiaryRows] = await Promise.all([
            corporateWalletId
                ? Promise.resolve([] as { id: number }[])
                : (DepositTransaction.findAll({
                      where: {
                          userId: user.id,
                          teamMemberId: corporate!.id,
                          ...(corporateVaId
                              ? { virtualAccountId: corporateVaId }
                              : {}),
                      },
                      attributes: ["id"],
                      raw: true,
                  }) as unknown as Promise<{ id: number }[]>),
            BeneficiaryTransaction.findAll({
                where: {
                    userId: user.id,
                    teamMemberId: corporate!.id,
                },
                attributes: ["id"],
                raw: true,
            }) as unknown as Promise<{ id: number }[]>,
        ]);

        // The root VA/wallet filter only makes sense for deposits —
        // move it inside the deposit arm.
        if (corporateVaId) {
            delete where.virtualAccountId;
        }
        if (corporateWalletId) {
            delete where.walletId;
        }

        andConditions.push({
            [Op.or]: [
                {
                    transactionType: MORPH_DEPOSIT_TRANSACTION,
                    transactionId: {
                        [Op.in]: idList(depositRows),
                    },
                    ...(corporateVaId
                        ? { virtualAccountId: corporateVaId }
                        : {}),
                    ...(corporateWalletId
                        ? { walletId: corporateWalletId }
                        : {}),
                },
                // Payout entries carry their own source columns —
                // no source filter here.
                {
                    transactionType: MORPH_BENEFICIARY_TRANSACTION,
                    transactionId: {
                        [Op.in]: idList(beneficiaryRows),
                    },
                },
            ],
        });
    }

    if (andConditions.length > 0) {
        where[Op.and] = andConditions;
    }

    return { where, corporate, isCorporate };
};

/**
 * Corporate running-balance override shared by list and export: the
 * member's own completed deposits (credits) and all their payouts
 * (debits) in chronological order; ledger rows outside the member's
 * timeline collapse to "0.00" (mirror of legacy).
 */
const applyCorporateBalanceOverride = async (
    req: Request,
    user: User,
    corporateMemberId: number,
    query: LedgerListQuery,
    enriched: EnrichedLedger[],
): Promise<void> => {
        // Corporate running balance: the member's own completed
        // deposits (credits) and all their payouts (debits), in
        // chronological order (mirror of the legacy timeline).
        let scopedVaId: number | null = null;
        let scopedWalletId: number | null = null;
        if (query.bank_account_id) {
            const baseScope = await getVirtualAccountScope(user);
            const virtualAccount = await VirtualAccount.findOne({
                where: {
                    ...(baseScope as Record<string, unknown>),
                    uniqueId: query.bank_account_id,
                },
            });
            if (virtualAccount) {
                scopedVaId = virtualAccount.id;
            }
        }
        if (query.wallet_id) {
            const wallet = await Wallet.findOne({
                where: {
                    uniqueId: query.wallet_id,
                    userId: user.id,
                },
            });
            if (wallet) {
                scopedWalletId = wallet.id;
            }
        }

        const depositTimeline = scopedWalletId
            ? []
            : ((await DepositTransaction.findAll({
                  where: {
                      userId: user.id,
                      teamMemberId: corporateMemberId,
                      status: DEPOSIT_TRANSACTION_COMPLETED,
                      ...(scopedVaId
                          ? { virtualAccountId: scopedVaId }
                          : {}),
                  },
                  order: [["created_at", "ASC"]],
                  attributes: ["id", "totalAmount", "createdAt"],
                  raw: true,
              })) as unknown as {
                  id: number;
                  totalAmount: string;
                  createdAt: Date;
              }[]);
        const beneficiaryTimeline = (await BeneficiaryTransaction.findAll(
            {
                where: {
                    userId: user.id,
                    teamMemberId: corporateMemberId,
                },
                order: [["created_at", "ASC"]],
                attributes: ["id", "totalAmount", "createdAt"],
                raw: true,
            },
        )) as unknown as {
            id: number;
            totalAmount: string;
            createdAt: Date;
        }[];

        const timeline: {
            id: number;
            type: string;
            amount: number;
            createdAt: Date;
        }[] = [];
        for (const deposit of depositTimeline) {
            timeline.push({
                id: deposit.id,
                type: MORPH_DEPOSIT_TRANSACTION,
                amount: Number(deposit.totalAmount),
                createdAt: new Date(deposit.createdAt),
            });
        }
        for (const beneficiary of beneficiaryTimeline) {
            timeline.push({
                id: beneficiary.id,
                type: MORPH_BENEFICIARY_TRANSACTION,
                amount: -Number(beneficiary.totalAmount),
                createdAt: new Date(beneficiary.createdAt),
            });
        }
        timeline.sort(
            (left, right) =>
                left.createdAt.getTime() - right.createdAt.getTime() ||
                left.id - right.id,
        );

        let runningBalance = 0;
        const balancesMap = new Map<string, string>();
        for (const item of timeline) {
            runningBalance += item.amount;
            balancesMap.set(
                `${item.type}_${item.id}`,
                runningBalance.toFixed(2),
            );
        }

        for (const ledger of enriched) {
            const key = `${ledger.transactionType}_${ledger.transactionId}`;
            // Missing keys collapse to zero for corporate views
            // (mirror of legacy).
            ledger.balanceOverride = balancesMap.get(key) ?? "0.00";
        }
};


/**
 * GET /api/user/ledgers/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as unknown as LedgerListQuery;
        const { where, corporate, isCorporate } = await buildLedgerListWhere(
            req,
            req.user,
            query,
        );

        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;
        const [total, rows] = await Promise.all([
            Ledger.count({ where }),
            Ledger.findAll({
                where,
                include: ledgerIncludes(),
                order: [["created_at", "DESC"]],
                offset: skip,
                limit: take,
            }),
        ]);
        const enriched: EnrichedLedger[] = [];
        for (const row of rows) {
            enriched.push(await loadTransaction(row));
        }

        if (isCorporate) {
            await applyCorporateBalanceOverride(
                req,
                req.user,
                corporate!.id,
                query,
                enriched,
            );
        }

        // Recompute the running balance dynamically when a specific
        // bank account or wallet is selected: the stored ledger.balance
        // snapshot can be stale for wallet-conversion DEBIT entries
        // (mirror of the legacy non-corporate recompute).
        if (!isCorporate && (query.bank_account_id || query.wallet_id)) {
            let scopedVirtualAccountId: number | null = null;
            let scopedWalletId: number | null = null;

            if (query.bank_account_id) {
                const baseScope = await getVirtualAccountScope(req.user);
                const virtualAccount = await VirtualAccount.findOne({
                    where: {
                        ...(baseScope as Record<string, unknown>),
                        uniqueId: query.bank_account_id,
                    },
                });
                if (virtualAccount) {
                    scopedVirtualAccountId = virtualAccount.id;
                }
            }
            if (query.wallet_id) {
                const wallet = await Wallet.findOne({
                    where: {
                        uniqueId: query.wallet_id,
                        userId: req.user.id,
                    },
                });
                if (wallet) {
                    scopedWalletId = wallet.id;
                }
            }

            // Completed deposits for this VA (wallet scopes have none).
            const depositTimelineRows = scopedWalletId
                ? []
                : ((await DepositTransaction.findAll({
                      where: {
                          userId: req.user.id,
                          status: DEPOSIT_TRANSACTION_COMPLETED,
                          ...(scopedVirtualAccountId
                              ? { virtualAccountId: scopedVirtualAccountId }
                              : {}),
                      },
                      order: [["created_at", "ASC"]],
                      attributes: ["id", "totalAmount", "createdAt"],
                      raw: true,
                  })) as unknown as {
                      id: number;
                      totalAmount: string;
                      createdAt: Date;
                  }[]);

            // Wallet-conversion transactions for this source.
            const walletTimelineRows = scopedVirtualAccountId
                ? ((await WalletTransaction.findAll({
                      where: {
                          userId: req.user.id,
                          type: TRANSACTION_TYPE_DEBIT,
                      },
                      include: [
                          {
                              model: Quote,
                              as: "quote",
                              where: {
                                  sourceType: MORPH_VIRTUAL_ACCOUNT,
                                  sourceId: scopedVirtualAccountId,
                              },
                              required: true,
                              attributes: ["totalSendingAmount"],
                          },
                      ],
                      order: [["created_at", "ASC"]],
                      attributes: ["id", "createdAt", "type", "amount"],
                  })) as unknown as (WalletTransaction & {
                      quote?: { totalSendingAmount: string | null };
                  })[])
                : scopedWalletId
                  ? ((await WalletTransaction.findAll({
                        where: {
                            userId: req.user.id,
                            walletId: scopedWalletId,
                            type: TRANSACTION_TYPE_CREDIT,
                        },
                        order: [["created_at", "ASC"]],
                        attributes: ["id", "createdAt", "type", "amount"],
                    })) as unknown as (WalletTransaction & {
                        quote?: { totalSendingAmount: string | null };
                    })[])
                  : [];

            // Beneficiary payouts sourced from this VA/wallet.
            const beneficiaryTimelineRows = (await BeneficiaryTransaction.findAll(
                {
                    where: { userId: req.user.id },
                    include: [
                        {
                            model: Quote,
                            as: "quotes",
                            where: {
                                ...(scopedVirtualAccountId
                                    ? {
                                          sourceType: MORPH_VIRTUAL_ACCOUNT,
                                          sourceId: scopedVirtualAccountId,
                                      }
                                    : {}),
                                ...(scopedWalletId
                                    ? {
                                          sourceType: MORPH_WALLET,
                                          sourceId: scopedWalletId,
                                      }
                                    : {}),
                            },
                            required: true,
                            attributes: [],
                        },
                    ],
                    order: [["created_at", "ASC"]],
                    attributes: ["id", "totalAmount", "createdAt"],
                    raw: true,
                },
            )) as unknown as {
                id: number;
                totalAmount: string;
                createdAt: Date;
            }[];

            const timeline: {
                id: number;
                type: string;
                amount: number;
                createdAt: Date;
            }[] = [];
            for (const deposit of depositTimelineRows) {
                timeline.push({
                    id: deposit.id,
                    type: MORPH_DEPOSIT_TRANSACTION,
                    amount: Number(deposit.totalAmount),
                    createdAt: new Date(deposit.createdAt),
                });
            }
            for (const walletTransaction of walletTimelineRows) {
                let amount = 0;
                if (scopedVirtualAccountId) {
                    amount = -Number(
                        walletTransaction.quote?.totalSendingAmount ?? 0,
                    );
                } else {
                    amount = Number(walletTransaction.amount ?? 0);
                }
                timeline.push({
                    id: walletTransaction.id,
                    type: MORPH_WALLET_TRANSACTION,
                    amount,
                    createdAt: new Date(walletTransaction.createdAt!),
                });
            }
            for (const beneficiary of beneficiaryTimelineRows) {
                timeline.push({
                    id: beneficiary.id,
                    type: MORPH_BENEFICIARY_TRANSACTION,
                    amount: -Number(beneficiary.totalAmount),
                    createdAt: new Date(beneficiary.createdAt),
                });
            }
            timeline.sort(
                (left, right) =>
                    left.createdAt.getTime() - right.createdAt.getTime() ||
                    left.id - right.id,
            );

            let runningBalance = 0;
            const balancesMap = new Map<string, string>();
            for (const item of timeline) {
                runningBalance += item.amount;
                balancesMap.set(
                    `${item.type}_${item.id}`,
                    runningBalance.toFixed(2),
                );
            }

            for (const ledger of enriched) {
                const key = `${ledger.transactionType}_${ledger.transactionId}`;
                if (balancesMap.has(key)) {
                    ledger.balanceOverride = balancesMap.get(key)!;
                }
                // Keys not found (e.g. a wallet CREDIT from a different
                // source) keep the stored balance.
            }
        }

        return res.sendResponse(
            {
                total,
                receiving_currency: query.receiving_currency || null,
                ledgers: enriched.map((ledger) =>
                    ledgerToJSON(ledger, {
                        wallet_id: query.wallet_id,
                        bank_account_id: query.bank_account_id,
                    }),
                ),
            },
            "",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/ledgers/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const row = await Ledger.findOne({
            where: {
                userId: req.user.id,
                uniqueId: String(req.query.ledger_id),
            },
            include: ledgerIncludes(),
        });
        if (!row) {
            return res.sendError("Ledger not found.", 149, 400);
        }
        const enriched = await loadTransaction(row);

        // Corporate members see the balance as of this row, computed
        // from their own deposits minus payouts (mirror of legacy).
        const corporate = teamMemberContext(req);
        if (
            corporate &&
            corporate.role === TEAM_MEMBER_ROLE_CORPORATE &&
            row.createdAt
        ) {
            const depositSum = row.walletId
                ? 0
                : Number(
                      (await DepositTransaction.sum("totalAmount", {
                          where: {
                              userId: req.user.id,
                              teamMemberId: corporate.id,
                              status: DEPOSIT_TRANSACTION_COMPLETED,
                              createdAt: { [Op.lte]: row.createdAt },
                              ...(row.virtualAccountId
                                  ? { virtualAccountId: row.virtualAccountId }
                                  : {}),
                          },
                      })) ?? 0,
                  );
            const beneficiaryRows = (await BeneficiaryTransaction.findAll({
                where: {
                    userId: req.user.id,
                    teamMemberId: corporate.id,
                    createdAt: { [Op.lte]: row.createdAt },
                },
                include: [
                    {
                        model: Quote,
                        as: "quotes",
                        where: {
                            ...(row.virtualAccountId
                                ? {
                                      sourceType: MORPH_VIRTUAL_ACCOUNT,
                                      sourceId: row.virtualAccountId,
                                  }
                                : {}),
                            ...(row.walletId
                                ? {
                                      sourceType: MORPH_WALLET,
                                      sourceId: row.walletId,
                                  }
                                : {}),
                        },
                        required: true,
                        attributes: [],
                    },
                ],
                attributes: ["totalAmount"],
                raw: true,
            })) as unknown as { totalAmount: string }[];
            const beneficiarySum = beneficiaryRows.reduce(
                (acc, item) => acc + Number(item.totalAmount ?? 0),
                0,
            );
            enriched.balanceOverride = (depositSum - beneficiarySum).toFixed(
                2,
            );
        }

        return res.sendResponse(
            { ledger: ledgerToJSON(enriched) },
            "",
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/ledgers/export — bulk ledger statement export as PDF
 * (default) or XLSX (?type=excel|xlsx), uploaded to S3 with a signed
 * temporary URL in the response. Mirror of the legacy
 * ledgerController.export: same filter set as the list endpoint but
 * without pagination, including the corporate running-balance
 * override. (The non-corporate per-source recompute is a list-only
 * behavior upstream — deliberately not applied here.)
 */
export const exportLedgers = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as unknown as LedgerListQuery;
        const fileType = String(
            (req.query as { type?: string }).type ?? "pdf",
        ).toLowerCase();

        const { where, corporate, isCorporate } = await buildLedgerListWhere(
            req,
            req.user,
            query,
        );

        const rows = await Ledger.findAll({
            where,
            include: ledgerIncludes(),
            order: [["created_at", "DESC"]],
        });
        const enriched: EnrichedLedger[] = [];
        for (const row of rows) {
            enriched.push(await loadTransaction(row));
        }

        if (isCorporate) {
            await applyCorporateBalanceOverride(
                req,
                req.user,
                corporate!.id,
                query,
                enriched,
            );
        }

        const resourceOptions = {
            wallet_id: query.wallet_id,
            bank_account_id: query.bank_account_id,
        };

        let buffer: Buffer;
        let contentType: string;
        let extension: string;

        if (fileType === "excel" || fileType === "xlsx") {
            const exportRows = enriched.map((ledger, index) => {
                const resource = ledgerToJSON(ledger, resourceOptions);
                const row: Record<string, unknown> = {
                    "S. No.": index + 1,
                    "Transaction ID": resource.transaction_id || "",
                    // Leading apostrophe keeps spreadsheet apps from
                    // mangling long numeric references (legacy parity).
                    "Client Ref No": `'${resource.client_reference_id || ""}`,
                    Credit:
                        resource.transaction_type === "CREDIT"
                            ? resource.amount
                            : "-",
                    Debit:
                        resource.transaction_type === "DEBIT"
                            ? resource.amount
                            : "-",
                };
                if (!query.receiving_currency) {
                    row.Balance = resource.balance || "";
                }
                row.Date = resource.created_at || "";
                return row;
            });

            buffer = await generateExcel(exportRows, {
                sheetTitle: "Ledgers",
            });
            contentType =
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            extension = "xlsx";
        } else {
            let accountDetails: Record<string, unknown> | null = null;
            if (query.bank_account_id) {
                const baseScope = await getVirtualAccountScope(req.user);
                const virtualAccount = await VirtualAccount.findOne({
                    where: {
                        ...(baseScope as Record<string, unknown>),
                        uniqueId: query.bank_account_id,
                    },
                });
                if (virtualAccount) {
                    accountDetails = {
                        account_number: virtualAccount.accountNumber,
                        account_holder_name: virtualAccount.accountHolderName,
                        currency: virtualAccount.currency,
                        account_bank_name: virtualAccount.accountBankName,
                        account_bank_code: virtualAccount.accountBankCode,
                        routing_number: virtualAccount.routingNumber,
                        account_bank_address:
                            virtualAccount.accountBankAddress,
                    };
                }
            } else if (query.wallet_id) {
                const wallet = await Wallet.findOne({
                    where: {
                        uniqueId: query.wallet_id,
                        userId: req.user.id,
                    },
                });
                if (wallet) {
                    accountDetails = {
                        account_number: "-",
                        account_holder_name:
                            `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
                            "-",
                        currency: wallet.currency,
                        account_bank_name: "Eficyent Wallet",
                        account_bank_code: "-",
                        routing_number: "-",
                        account_bank_address: "-",
                    };
                }
            }

            const ledgerDetails = enriched.map((ledger) => {
                const resource = ledgerToJSON(ledger, resourceOptions);
                return {
                    transaction_id: resource.transaction_id,
                    client_reference_id: resource.client_reference_id,
                    transaction_type: resource.transaction_type,
                    amount: resource.amount,
                    balance: resource.balance,
                    created_at: resource.created_at,
                };
            });

            const translations: Record<string, string> = {
                bank_statement: "Bank Statement",
                account_number: "Account Number",
                account_holder: "Account Holder",
                currency: "Currency",
                receiving_currency: "Receiving Currency",
                account_bank_name: "Bank Name",
                bank_code: "Bank Code",
                routing_number: "Routing Number",
                bank_address: "Bank Address",
                s_no: "S.No",
                transaction_id: "Transaction ID",
                client_ref_no: "Client Ref No",
                credit: "Credit",
                debit: "Debit",
                balance: "Balance",
                date: "Date",
                na: "N/A",
            };
            const tr = (key: string) => translations[key] || key;

            const html = await renderViewTemplate(
                "invoice/balanceAndStatements.ejs",
                {
                    tr,
                    date: formatReportDate(),
                    logo: loadLogoDataUrl(),
                    account_details: accountDetails,
                    receiving_currency: query.receiving_currency || null,
                    ledger_details: ledgerDetails,
                },
            );
            buffer = await renderPdfFromHtml(html);
            contentType = "application/pdf";
            extension = "pdf";
        }

        const key = await upload(
            { buffer, contentType, extension },
            "exports/ledgers",
        );
        const signedUrl = await temporaryUrl(key);
        return res.sendResponse({ url: signedUrl }, "", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};
