import { Request, Response } from "express";
import { Prisma, User } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  IDENTITY_VERIFICATION_COMPLETED,
  ONBOARDING_STEP_FOUR_COMPLETED,
  QUOTE_SUBMITTED,
  TAKE_COUNT,
  TRANSACTION_TYPE_CREDIT,
  WALLET_STATUS_ACTIVE,
  WALLET_STATUS_MAP,
  WALLET_TRANSACTION_PENDING,
} from "../../helpers/constants";
import { uniqueId } from "../../helpers/uniqueId";
import {
  walletResource,
  walletTransactionResource,
} from "../../services/wallets/walletResource";
import {
  computeBankBalance,
  getWalletBalance,
} from "../../services/virtualAccounts/balanceService";
import {
  getVirtualAccountScope,
} from "../../services/virtualAccounts/virtualAccountService";
import { getFlagUrl } from "../../helpers/lookups";
import {
  ConvertInput,
  WalletListInput,
  WalletShowInput,
  WalletTransactionShowInput,
  WalletTransactionsInput,
} from "../../validators/wallets/walletValidators";

const ZERO = new Prisma.Decimal(0);
const APP_URL = process.env.APP_URL ?? "https://dev-eficyent.rare-able.com";

/**
 * Mirror of Api\\WalletController + UserWalletRepository.
 *
 * `index` calls `create_all_wallets` first - lazily provisions a wallet row
 * for every supported-country currency in the user's service_providers list.
 *
 * `convert` debits the source virtual account (via the linked quote) and
 * credits the matching-currency wallet. The Helper::updateLedger call from
 * Laravel is wired here through ledgerService - which writes a Ledger row
 * and (for VirtualAccount sources) keeps wallet_transactions paired with
 * the source by quote_id.
 */

async function createAllWallets(user: User): Promise<void> {
  // Mirror of UserWalletRepository::create_all_wallets - precondition gates.
  if (
    user.onboardingStep !== ONBOARDING_STEP_FOUR_COMPLETED &&
    user.idVerification !== IDENTITY_VERIFICATION_COMPLETED
  ) {
    return;
  }
  const baseScope = await getVirtualAccountScope(user);
  const va = await prisma().virtualAccount.findFirst({
    where: baseScope,
  });
  if (!va) return;

  const providers = Array.isArray(user.serviceProviders)
    ? (user.serviceProviders as string[])
    : [];
  if (providers.length === 0) return;

  const currencies = await prisma().supportedCountry.findMany({
    where: { status: 1, externalType: { in: providers } },
    distinct: ["currency"],
    select: { currency: true },
  });
  for (const { currency } of currencies) {
    if (currency === "USD") continue;
    await prisma().wallet.upsert({
      where: { userId_currency: { userId: user.id, currency } },
      create: {
        uniqueId: uniqueId(24),
        userId: user.id,
        currency,
      },
      update: {},
    });
  }
}

export const walletController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as WalletListInput;
    await createAllWallets(req.user);

    const status =
      q.status && q.status in WALLET_STATUS_MAP ? WALLET_STATUS_MAP[q.status] : null;
    const where: Prisma.WalletWhereInput = {
      userId: req.user.id,
      ...(q.currency ? { currency: q.currency } : {}),
      ...(status !== null ? { status } : {}),
      ...(q.search_key ? { currency: { contains: q.search_key } } : {}),
    };
    const rows = await prisma().wallet.findMany({ where });
    const withBalance = await Promise.all(
      rows.map(async (w) => {
        const balance = await getWalletBalance(req.user!, w);
        const country = await prisma().supportedCountry.findFirst({
          where: { currency: w.currency },
          select: { countryCode: true },
        });
        const flag = country ? getFlagUrl(country.countryCode, APP_URL) : null;
        return { row: w, balance, flag };
      }),
    );
    let sorted = withBalance.sort((a, b) => b.balance.minus(a.balance).toNumber());
    if (
      q.only_with_balance === true ||
      q.only_with_balance === "true" ||
      q.only_with_balance === 1
    ) {
      sorted = sorted.filter((w) => w.balance.gt(0));
    }
    const total = sorted.length;
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const page = sorted.slice(skip, skip + take);
    return sendResponse(res, "", 200, {
      total,
      wallets: page.map((w) =>
        walletResource({ ...w.row, balance: w.balance.toString(), flag: w.flag } as never),
      ),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as WalletShowInput;
    if (!q.wallet_id) throw new ApiException(167);

    const w = await prisma().wallet.findFirst({
      where: { userId: req.user.id, uniqueId: q.wallet_id },
    });
    if (!w) throw new ApiException(167);
    const balance = await getWalletBalance(req.user, w);
    const country = await prisma().supportedCountry.findFirst({
      where: { currency: w.currency },
      select: { countryCode: true },
    });
    const flag = country ? getFlagUrl(country.countryCode, APP_URL) : null;

    return sendResponse(res, "", 200, {
      wallet: walletResource({ ...w, balance: balance.toString(), flag } as never),
    });
  },

  async convert(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as ConvertInput;

    const quote = await prisma().quote.findFirst({
      where: { uniqueId: body.quote_id, userId: req.user.id },
    });
    if (!quote) throw new ApiException(121);
    if (!quote.receivingCurrency) throw new ApiException(121);

    const wallet = await prisma().wallet.findFirst({
      where: { userId: req.user.id, currency: quote.receivingCurrency },
    });
    if (!wallet) throw new ApiException(167);
    if (wallet.status !== WALLET_STATUS_ACTIVE) throw new ApiException(169);

    // Source-balance check (mirror Helper::bankBalance($user, $quote->source)).
    if (!quote.sourceId) throw new ApiException(120);
    const baseScope = await getVirtualAccountScope(req.user);
    const va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, id: quote.sourceId },
    });
    if (!va) throw new ApiException(120);
    const checkBalance = await computeBankBalance(req.user, va);
    if (quote.amount.gt(checkBalance)) throw new ApiException(154);

    const balanceBefore = await getWalletBalance(req.user, wallet);
    void ZERO;

    const randPart = Math.floor(Math.random() * 900) + 100;
    const now = new Date();
    const datePart = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");
    const fxPart = (quote.fxRate || "").replace(/\./g, "");
    const transactionIdStr = `${randPart}${datePart}${fxPart}`;

    const wt = await prisma().$transaction(async (tx) => {
      const created = await tx.walletTransaction.create({
        data: {
          uniqueId: uniqueId(24),
          transactionId: transactionIdStr,
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
        } as any,
      });
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: QUOTE_SUBMITTED },
      });
      // Ledger.transaction polymorphic write - mirrors Helper::updateLedger
      // for the WalletTransaction case. Full polymorphic ledger mirroring
      // BeneficiaryTransaction + DepositTransaction lands in Phase 5; here
      // we record the wallet credit so the audit chain stays continuous.
      await tx.ledger.create({
        data: {
          uniqueId: uniqueId(24),
          userId: req.user!.id,
          virtualAccountId: va.id,
          walletId: wallet.id,
          transactionType: "App\\Models\\WalletTransaction",
          transactionId: created.id,
          balance: balanceBefore,
          externalType: quote.externalType,
          description: `Wallet conversion (${quote.uniqueId})`,
        },
      });
      return created;
    });
    return sendResponse(res, apiSuccess(108), 108, {
      wallet_transaction: walletTransactionResource(wt as never),
    });
  },

  async transactions(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as WalletTransactionsInput;
    const where: Prisma.WalletTransactionWhereInput = {
      userId: req.user.id,
      beneficiaryTransactionId: null,
      ...(q.transaction_type !== undefined ? { type: q.transaction_type } : {}),
      ...(q.status !== undefined ? { status: q.status } : {}),
      ...(q.search_key ? { uniqueId: { contains: q.search_key } } : {}),
    };
    if (q.wallet_id) {
      const w = await prisma().wallet.findFirst({
        where: { uniqueId: q.wallet_id, userId: req.user.id },
      });
      if (!w) throw new ApiException(167);
      where.walletId = w.id;
    }
    if (q.from_date && q.to_date) {
      where.createdAt = {
        gte: new Date(`${q.from_date}T00:00:00Z`),
        lte: new Date(`${q.to_date}T23:59:59Z`),
      };
    }
    const skip = q.skip ?? 0;
    const take = q.take ?? TAKE_COUNT;
    const [total, rows] = await Promise.all([
      prisma().walletTransaction.count({ where }),
      prisma().walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return sendResponse(res, "", 200, {
      total,
      wallet_transactions: rows.map(walletTransactionResource),
    });
  },

  async showTransaction(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as WalletTransactionShowInput;
    const t = await prisma().walletTransaction.findFirst({
      where: { userId: req.user.id, uniqueId: q.wallet_transaction_id },
    });
    if (!t) throw new ApiException(404, undefined, 404);
    return sendResponse(res, "", 200, {
      wallet_transaction: walletTransactionResource(t),
    });
  },
};
