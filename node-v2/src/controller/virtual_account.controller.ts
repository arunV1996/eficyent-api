import { Request, Response } from "express";
import { Op } from "sequelize";
import { availableBanks } from "../helpers/available_banks.helper";
import { computeBankBalance } from "../helpers/balance.helper";
import { CodedError } from "../helpers/coded_error.helper";
import { settingGet } from "../helpers/setting.helper";
import {
    teamMemberContext,
    TeamRequestContext,
} from "../helpers/team_context.helper";
import { getVirtualAccountScope } from "../helpers/virtual_account.helper";
import User from "../models/user.model";
import UserService from "../models/user_service.model";
import VirtualAccount from "../models/virtual_account.model";
import { virtualAccountToJSON } from "../resources/virtual_account.resource";
import { onboardingStatusLabel } from "../utils/common.utils";
import {
    MERCHANT_TYPE_PAYOUT,
    TAKE_COUNT,
    TEAM_MEMBER_ROLE_CORPORATE,
    VIRTUAL_ACCOUNT_STATUS_CREATED,
    VIRTUAL_ACCOUNT_STATUS_MAP,
} from "../utils/constants";

/**
 * Mirror of Api\VirtualAccountController + VirtualAccountRepository
 * (via the legacy virtualAccountsController).
 *
 * The accounts grouping ("ACH + SWIFT" merge) mirrors the legacy repo:
 * accounts sharing an external_type collapse into a parent + .swift
 * child.
 *
 * The /activate endpoint is a stub in the legacy service too (the
 * onboarding/VA factories are commented out upstream) — it returns the
 * same success envelope without side effects.
 *
 * Team tokens flow through unchanged: balances are scoped to the
 * corporate member's own activity when applicable (mirror of legacy).
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

type GroupedAccount = VirtualAccount & {
    swift?: VirtualAccount | null;
    balance?: string;
};

const groupAccountsByExternalType = (
    accounts: VirtualAccount[],
): GroupedAccount[] => {
    const byType = new Map<string, VirtualAccount[]>();
    for (const account of accounts) {
        const key = account.externalType ?? "_";
        const list = byType.get(key);
        if (list) {
            list.push(account);
        } else {
            byType.set(key, [account]);
        }
    }
    const grouped: GroupedAccount[] = [];
    for (const [, group] of byType) {
        const parent = group.find(
            (candidate) => !candidate.accountBankCode,
        ) as GroupedAccount | undefined;
        const swift = group.find((candidate) =>
            Boolean(candidate.accountBankCode),
        );
        if (parent && swift && parent !== swift) {
            parent.swift = swift;
            grouped.push(parent);
        } else {
            grouped.push(...group);
        }
    }
    return grouped;
};

const attachBalance = async (
    user: User,
    account: GroupedAccount,
    teamContext: TeamRequestContext | null = null,
): Promise<void> => {
    const balance = await computeBankBalance(user, account, teamContext);
    account.balance = balance.toString();
};

const resolveAppUrl = async (): Promise<string> => {
    return (
        (await settingGet<string>("app_url", "")) ||
        process.env.APP_URL ||
        ""
    );
};

/**
 * Mirror of the legacy virtual-accounts memo generator (this variant
 * has no user-type branch, unlike the deposits one).
 */
const generateUserMemo = (user: User): string => {
    const name =
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
    const prefix = name.slice(0, 3).toUpperCase();
    const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
    return `${prefix}${suffix}`;
};

const isTruthyFlag = (value: unknown): boolean => {
    return value === "true" || value === "1";
};

/**
 * GET /api/user/accounts/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;

        const statusInt =
            query.status && query.status in VIRTUAL_ACCOUNT_STATUS_MAP
                ? VIRTUAL_ACCOUNT_STATUS_MAP[query.status]
                : null;

        const baseScope = await getVirtualAccountScope(
            req.user,
            req.merchant,
        );
        const where: Record<string, unknown> = {
            ...(baseScope as Record<string, unknown>),
        };
        if (query.country) {
            where.country = query.country;
        }
        if (query.currency) {
            where.currency = query.currency;
        }
        if (query.account_number) {
            where.accountNumber = query.account_number;
        }
        if (query.account_holder_name) {
            where.accountHolderName = {
                [Op.like]: `%${query.account_holder_name}%`,
            };
        }
        if (query.account_bank_name) {
            where.accountBankName = query.account_bank_name;
        }
        if (statusInt !== null) {
            where.status = statusInt;
        }

        const skip = req.query.skip !== undefined ? Number(req.query.skip) : 0;
        const take =
            req.query.take !== undefined ? Number(req.query.take) : TAKE_COUNT;

        const [allRows, pageRows] = await Promise.all([
            VirtualAccount.findAll({
                where,
                order: [["created_at", "DESC"]],
            }),
            VirtualAccount.findAll({
                where,
                order: [["created_at", "DESC"]],
                offset: skip,
                limit: take,
            }),
        ]);

        const groupedTotal = groupAccountsByExternalType(allRows).length;
        const grouped = groupAccountsByExternalType(pageRows);

        if (isTruthyFlag(query.with_balance)) {
            for (const account of grouped) {
                await attachBalance(req.user, account, teamMemberContext(req));
            }
        }

        if (!req.user.memo) {
            await User.update(
                { memo: generateUserMemo(req.user) },
                { where: { id: req.user.id } },
            );
        }

        const appUrl = await resolveAppUrl();
        return res.sendResponse(
            {
                total: groupedTotal,
                accounts: grouped.map((account) =>
                    virtualAccountToJSON(
                        account,
                        req.user!.memo ?? "",
                        appUrl,
                        req.user!.timezone,
                    ),
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
 * GET /api/user/accounts/available_banks
 */
export const listAvailableBanks = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (req.merchant && req.merchant.type === MERCHANT_TYPE_PAYOUT) {
            return res.sendResponse(
                { available_banks: [] },
                "Available banks fetched.",
                200,
            );
        }

        const banks = availableBanks();
        const services = await UserService.findAll({
            where: { userId: req.user.id },
        });
        for (const bank of banks) {
            const service = services.find(
                (candidate) => candidate.serviceType === bank.key,
            );
            if (service) {
                const status = parseInt(String(service.status), 10);
                bank.status = Number.isFinite(status) ? status : bank.status;
            }
        }

        const baseScope = await getVirtualAccountScope(
            req.user,
            req.merchant,
        );
        const existing = await VirtualAccount.findAll({
            where: {
                ...(baseScope as Record<string, unknown>),
                status: VIRTUAL_ACCOUNT_STATUS_CREATED,
            },
            attributes: ["externalType"],
        });
        const existingTypes = new Set(
            existing.map((account) => account.externalType),
        );

        const filtered = banks
            .filter((bank) => bank.status <= 0)
            .filter((bank) => !existingTypes.has(bank.key))
            .map((bank) => ({
                key: bank.key,
                value: bank.value,
                currency: bank.currency,
                status: onboardingStatusLabel(bank.status),
            }));

        return res.sendResponse(
            { available_banks: filtered },
            "Available banks fetched successfully.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/accounts/activate — legacy stub preserved: the
 * upstream onboarding/VA factories are commented out, so the endpoint
 * acknowledges without side effects.
 */
export const activate = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        return res.sendResponse(
            [],
            "Virtual account creation initiated.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/accounts/get_account_balance
 */
export const getBalance = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const baseScope = await getVirtualAccountScope(
            req.user,
            req.merchant,
        );
        const virtualAccount = (await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: String(req.query.unique_id),
            },
        })) as GroupedAccount | null;
        if (!virtualAccount) {
            return res.sendError(res.__("116"), 116, 400);
        }
        await attachBalance(req.user, virtualAccount, teamMemberContext(req));
        const appUrl = await resolveAppUrl();
        return res.sendResponse(
            {
                account: virtualAccountToJSON(
                    virtualAccount,
                    req.user.memo ?? "",
                    appUrl,
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

/**
 * GET /api/user/accounts/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const baseScope = await getVirtualAccountScope(
            req.user,
            req.merchant,
        );
        const virtualAccount = await VirtualAccount.findOne({
            where: {
                ...(baseScope as Record<string, unknown>),
                uniqueId: String(req.query.unique_id),
            },
        });
        if (!virtualAccount) {
            return res.sendError(res.__("116"), 116, 400);
        }

        // Group with siblings of the same external_type (ACH + SWIFT).
        const siblings = await VirtualAccount.findAll({
            where: {
                ...(baseScope as Record<string, unknown>),
                externalType: virtualAccount.externalType,
            },
        });
        const grouped = groupAccountsByExternalType(siblings);
        const account =
            grouped.find(
                (candidate) =>
                    candidate.uniqueId === virtualAccount.uniqueId ||
                    candidate.swift?.uniqueId === virtualAccount.uniqueId,
            ) ?? (virtualAccount as GroupedAccount);

        if (isTruthyFlag(req.query.with_balance)) {
            await attachBalance(req.user, account, teamMemberContext(req));
        }
        const appUrl = await resolveAppUrl();
        return res.sendResponse(
            {
                account: virtualAccountToJSON(
                    account,
                    req.user.memo ?? "",
                    appUrl,
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

/**
 * GET /api/user/accounts/balances
 */
export const balances = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const baseScope = await getVirtualAccountScope(
            req.user,
            req.merchant,
        );
        const accounts = await VirtualAccount.findAll({
            where: baseScope as Record<string, unknown>,
        });
        const corporateContext = teamMemberContext(req);
        const balanceContext =
            corporateContext &&
            corporateContext.role === TEAM_MEMBER_ROLE_CORPORATE
                ? corporateContext
                : null;
        const accountBalances = await Promise.all(
            accounts.map(async (account) => ({
                currency: account.currency,
                balance: (
                    await computeBankBalance(req.user!, account, balanceContext)
                ).toString(),
            })),
        );
        return res.sendResponse({ balances: accountBalances }, "", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/accounts/get_virtual_Accounts — backwards-compatible
 * alias used by some merchant integrations.
 */
export const getVirtualAccounts = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const baseScope = await getVirtualAccountScope(
            req.user,
            req.merchant,
        );
        const accounts = await VirtualAccount.findAll({
            where: baseScope as Record<string, unknown>,
            order: [["created_at", "DESC"]],
        });
        const grouped = groupAccountsByExternalType(accounts);
        const appUrl = await resolveAppUrl();
        return res.sendResponse(
            {
                accounts: grouped.map((account) =>
                    virtualAccountToJSON(
                        account,
                        req.user!.memo ?? "",
                        appUrl,
                        req.user!.timezone,
                    ),
                ),
            },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
