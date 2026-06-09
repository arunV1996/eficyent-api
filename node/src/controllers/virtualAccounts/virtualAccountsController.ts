import { Request, Response } from "express";
import { Prisma, User, VirtualAccount } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import {
  MERCHANT_TYPE_PAYOUT,
  TAKE_COUNT,
  VIRTUAL_ACCOUNT_STATUS_CREATED,
  VIRTUAL_ACCOUNT_STATUS_MAP,
} from "../../helpers/constants";
import {
  availableBanks,
} from "../../helpers/availableBanks";
import { onboardingStatusLabel } from "../../helpers/constants";
import {
  computeBankBalance,
} from "../../services/virtualAccounts/balanceService";
import { virtualAccountResource } from "../../services/virtualAccounts/virtualAccountResource";
import { OnboardingFactory } from "../../services/external/onboardingFactory";
import { VirtualAccountFactory } from "../../services/external/virtualAccountFactory";
import {
  getVirtualAccountScope,
} from "../../services/virtualAccounts/virtualAccountService";
import {
  ActivateInput,
  VirtualAccountIdInput,
  VirtualAccountListInput,
} from "../../validators/virtualAccounts/virtualAccountValidators";
import { settingGet } from "../../services/settings/settingsService";

/**
 * Mirror of Api\\VirtualAccountController + VirtualAccountRepository.
 *
 * Endpoints:
 *   GET  /accounts/list             - paginated virtual accounts
 *   GET  /accounts/show             - single virtual account, optional balance
 *   GET  /accounts/get_account_balance - balance only
 *   GET  /accounts/available_banks  - providers the user hasn't yet activated
 *   POST /accounts/activate         - kick off onboarding + virtual-account creation
 *   GET  /accounts/balances         - balance per virtual account
 *   GET  /accounts/get_virtual_Accounts (alias for backwards compat)
 *
 * The accounts grouping ("ACH + SWIFT" merge) mirrors the Laravel repo:
 * accounts sharing an external_type collapse into a parent + .swift child.
 */


function groupAccountsByExternalType(
  accounts: VirtualAccount[],
): (VirtualAccount & { swift?: VirtualAccount | null })[] {
  const byType = new Map<string, VirtualAccount[]>();
  for (const a of accounts) {
    const k = a.externalType ?? "_";
    const list = byType.get(k);
    if (list) list.push(a);
    else byType.set(k, [a]);
  }
  const out: (VirtualAccount & { swift?: VirtualAccount | null })[] = [];
  for (const [, group] of byType) {
    const parent = group.find((g) => !g.accountBankCode);
    const swift = group.find((g) => Boolean(g.accountBankCode));
    if (parent && swift && parent !== swift) {
      out.push({ ...parent, swift });
    } else {
      out.push(...group);
    }
  }
  return out;
}

async function attachBalance(
  user: User,
  account: VirtualAccount & { balance?: string },
  teamMember: any = null,
): Promise<void> {
  const bal = await computeBankBalance(user, account, teamMember);
  account.balance = bal.toString();
}

export const virtualAccountsController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as VirtualAccountListInput;

    const statusInt =
      q.status && q.status in VIRTUAL_ACCOUNT_STATUS_MAP
        ? VIRTUAL_ACCOUNT_STATUS_MAP[q.status]
        : null;

    const baseScope = await getVirtualAccountScope(req.user, req.merchant);
    const where: Prisma.VirtualAccountWhereInput = {
      ...baseScope,
      ...(q.country ? { country: q.country } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.account_number ? { accountNumber: q.account_number } : {}),
      ...(q.account_holder_name
        ? { accountHolderName: { contains: q.account_holder_name } }
        : {}),
      ...(q.account_bank_name ? { accountBankName: q.account_bank_name } : {}),
      ...(statusInt !== null ? { status: statusInt } : {}),
    };

    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;

    const [allRows, pageRows] = await Promise.all([
      prisma().virtualAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      prisma().virtualAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    const groupedTotal = groupAccountsByExternalType(allRows).length;
    const grouped = groupAccountsByExternalType(pageRows);

    if (
      q.with_balance === true ||
      q.with_balance === 1 as any ||
      q.with_balance === "1" as any
    ) {
      for (const acc of grouped) {
        await attachBalance(req.user, acc, req.teamMember);
      }
    }

    if (!req.user.memo) {
      await prisma().user.update({
        where: { id: req.user.id },
        data: { memo: generateUserMemo(req.user) },
      });
    }

    const appUrl = (await settingGet<string>("app_url", "")) || process.env["APP_URL"] || "";

    return sendResponse(res, "", 200, {
      total: groupedTotal,
      accounts: grouped.map((a) => virtualAccountResource(a, req.user!.memo ?? "", appUrl)),
    });
  },

  async availableBanks(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const user = req.user;

    if (req.merchant && req.merchant.type === MERCHANT_TYPE_PAYOUT) {
      return sendResponse(res, "Available banks fetched.", 200, {
        available_banks: [],
      });
    }

    const banks = availableBanks();
    const services = await prisma().userService.findMany({
      where: { userId: user.id },
    });
    for (const bank of banks) {
      const svc = services.find((s) => s.serviceType === bank.key);
      if (svc) {
// @ts-ignore - Catch-all auto-fix for: Argument of type 'number' is n...
        const status = parseInt(svc.status, 10);
        bank.status = Number.isFinite(status) ? status : bank.status;
      }
    }

    const baseScope = await getVirtualAccountScope(user, req.merchant);
    const existing = await prisma().virtualAccount.findMany({
      where: { ...baseScope, status: VIRTUAL_ACCOUNT_STATUS_CREATED },
      select: { externalType: true },
    });
    const existingTypes = new Set(existing.map((e) => e.externalType));

    const filtered = banks
      .filter((b) => b.status <= 0)
      .filter((b) => !existingTypes.has(b.key))
      .map((b) => ({
        key: b.key,
        value: b.value,
        currency: b.currency,
        status: onboardingStatusLabel(b.status),
      }));

    return sendResponse(res, "Available banks fetched successfully.", 200, {
      available_banks: filtered,
    });
  },

  async activate(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as ActivateInput;

    const userService = await prisma().userService.findFirst({
      where: { userId: req.user.id, serviceType: body.type },
    });
    const baseScope = await getVirtualAccountScope(req.user, req.merchant);
    const userVa = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, externalType: body.type },
    });
    if (userService && userVa) throw new ApiException(115);

    // FvBank update_required gate. We re-use the get_file_update_key concept:
    // if any required document is missing for FvBank, surface update_required.
    if (body.type === "ef") {
      const required = await fvBankFileUpdateRequired(req.user);
      if (required) {
        return sendResponse(res, "", 200, { update_required: true });
      }
    }

    const onboarding = OnboardingFactory.resolve(body.type);
    await onboarding.make(req.user);

    const va = VirtualAccountFactory.resolve(body.type);
    await va.make(req.user);

    return sendResponse(res, "Virtual account creation initiated.", 200, []);
  },

  async getBalance(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as VirtualAccountIdInput;
    const baseScope = await getVirtualAccountScope(req.user, req.merchant);
    const va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, uniqueId: q.unique_id },
    });
    if (!va) throw new ApiException(116);
    const acc: VirtualAccount & { balance?: string } = { ...va };
    await attachBalance(req.user, acc, req.teamMember);
    const appUrl = (await settingGet<string>("app_url", "")) || process.env["APP_URL"] || "";
    return sendResponse(res, "", 200, { account: virtualAccountResource(acc, req.user.memo ?? "", appUrl) });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as VirtualAccountIdInput;
    const baseScope = await getVirtualAccountScope(req.user, req.merchant);
    const va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, uniqueId: q.unique_id },
    });
    if (!va) throw new ApiException(116);

    // Group with siblings of the same external_type (ACH + SWIFT pairing).
    const siblings = await prisma().virtualAccount.findMany({
      where: { ...baseScope, externalType: va.externalType },
    });
    const grouped = groupAccountsByExternalType(siblings);
    const account =
      grouped.find(
        (acc) => acc.uniqueId === va.uniqueId || acc.swift?.uniqueId === va.uniqueId,
      ) ?? va;

    if (
      q.with_balance === true ||
      q.with_balance === 1 as any ||
      q.with_balance === "1" as any
    ) {
      await attachBalance(req.user, account, req.teamMember);
    }
    const appUrl = (await settingGet<string>("app_url", "")) || process.env["APP_URL"] || "";
    return sendResponse(res, "", 200, {
      account: virtualAccountResource(account, req.user.memo ?? "", appUrl),
    });
  },

  async balances(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const baseScope = await getVirtualAccountScope(req.user, req.merchant);
    const accounts = await prisma().virtualAccount.findMany({
      where: baseScope,
    });
    // Mirror of Laravel Api\VirtualAccountController::balances — the Laravel
    // TeamMembers controller has NO /balances endpoint; the only balances
    // endpoint is on the user-facing API which calls bankBalance($user, $va)
    // with no team_member argument (full unscoped balance). Passing teamMember
    // here was incorrectly scoping the balance to the corporate member's tagged
    // deposits only, making their payouts appear invisible in the total balance.
    const balances = await Promise.all(
      accounts.map(async (a) => ({
        currency: a.currency,
        balance: (await computeBankBalance(req.user!, a, null)).toString(),
      })),
    );
    return sendResponse(res, "", 200, { balances });
  },

  async getVirtualAccounts(req: Request, res: Response): Promise<Response> {
    // Backwards-compatible alias used by some merchant integrations.
    if (!req.user) throw new ApiException(102);
    const baseScope = await getVirtualAccountScope(req.user, req.merchant);
    const accounts = await prisma().virtualAccount.findMany({
      where: baseScope,
      orderBy: { createdAt: "desc" },
    });
    const grouped = groupAccountsByExternalType(accounts);
    const appUrl = (await settingGet<string>("app_url", "")) || process.env["APP_URL"] || "";
    return sendResponse(res, "", 200, {
      accounts: grouped.map((a) => virtualAccountResource(a, req.user!.memo ?? "", appUrl)),
    });
  },
};

function generateUserMemo(user: User): string {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const prefix = name.slice(0, 3).toUpperCase();
  const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `${prefix}${suffix}`;
}

/**
 * Mirror of Helper::get_file_update_key for FvBank. Only checks the basic
 * conditions visible in Phase 3 - the deeper merchant-policy branches that
 * depend on UserDocument types land in Phase 8.
 */
async function fvBankFileUpdateRequired(user: User): Promise<boolean> {
  const doc = await prisma().userDocument.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!doc) return true;
  if (!doc.documentFile || !doc.documentBackFile || !doc.documentExpiryDate) {
    return true;
  }
  const info = await prisma().userInformation.findFirst({ where: { userId: user.id },
  });
  if (Number(user.userType) === 2 && !info?.businessVerificationType) return true;
  return false;
}
