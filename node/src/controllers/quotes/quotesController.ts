import { Request, Response } from "express";
import { Prisma, Quote, User, VirtualAccount, Wallet } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import {
  EXTERNAL_TYPE_MASSIVE,
  MORPH_VIRTUAL_ACCOUNT,
  MORPH_WALLET,
  QUOTE_MODE_QUOTATION,
  QUOTE_MODE_RATE,
  QUOTE_TYPE_REVERSE,
  WALLET_STATUS_ACTIVE,
} from "../../helpers/constants";
import { USER_TYPE_MAP } from "../../helpers/lookups";
import { uniqueId } from "../../helpers/uniqueId";
import { getVirtualAccountScope } from "../../services/virtualAccounts/virtualAccountService";
import { QuoteStoreInput } from "../../validators/quotes/quoteValidators";
import { quoteResource } from "../../services/quotes/quoteResource";
import {
  calcFxCommissions,
  calcTransactionCommissions,
  getFixedRate,
} from "../../services/commissions/commissionsService";
import {
  QuoteDriverResponse,
  QuoteFactory,
} from "../../services/external/quoteFactory";
import { applyAedOverrideToQuote } from "../../services/quotes/aedOverride";

const ZERO = new Prisma.Decimal(0);

/**
 * Mirror of Api\\QuotesController + QuoteRepository::store.
 *
 * Endpoint behavior preserved exactly:
 *   - source resolution (VirtualAccount or Wallet) via the validator's
 *     mutually-exclusive bank_account_id / wallet_id.
 *   - Same-currency path: fx_rate = 1, no external call, transaction
 *     commissions only (when source is VirtualAccount).
 *   - Cross-currency VirtualAccount path: invokes the Massive driver
 *     (Phase 8 stub - throws 501) and applies fx + transaction commissions.
 *   - Wallet source must match receiving_currency 1:1 (122 / 169).
 *   - mode=rate (the GET /exchange-rate route) uses QUOTE_MODE_RATE which
 *     skips the transaction-commission line.
 */

interface SourceVirtualAccount {
  kind: "virtual_account";
  row: VirtualAccount;
}

interface SourceWallet {
  kind: "wallet";
  row: Wallet;
}

type ResolvedSource = SourceVirtualAccount | SourceWallet;

async function resolveSource(
  body: QuoteStoreInput,
  user: User,
): Promise<ResolvedSource> {
  if (body.bank_account_id) {
    const baseScope = await getVirtualAccountScope(user);
    const va = await prisma().virtualAccount.findFirst({
      where: { ...baseScope, uniqueId: body.bank_account_id },
    });
    if (!va) throw new ApiException(120);
    return { kind: "virtual_account", row: va };
  }
  if (body.wallet_id) {
    const wallet = await prisma().wallet.findFirst({
      where: { uniqueId: body.wallet_id, userId: user.id },
    });
    if (!wallet) throw new ApiException(120);
    return { kind: "wallet", row: wallet };
  }
  throw new ApiException(120);
}

interface QuoteMode {
  mode: typeof QUOTE_MODE_RATE | typeof QUOTE_MODE_QUOTATION;
}

async function buildResponse(
  body: QuoteStoreInput,
  source: ResolvedSource,
  userId: bigint,
  merchantId: bigint | null,
  quoteMode: QuoteMode["mode"],
  recipientTypeNumeric: number,
): Promise<Record<string, unknown>> {
  const receivingCurrency = body.receiving_currency.toUpperCase();
  const isCrossBorderUsd =
    body.recipient_country !== "USA" && receivingCurrency === "USD";
  const paymentRail = isCrossBorderUsd ? "swift" : body.payment_rail ?? null;

  if (source.kind === "wallet") {
    if (source.row.currency !== receivingCurrency) throw new ApiException(172);
    if (source.row.status !== WALLET_STATUS_ACTIVE) throw new ApiException(169);
    return {
      amount: body.amount,
      total_sending_amount: body.amount,
      fx_rate: "1",
      external_fx_rate: "1",
      internal_fx_rate: "1",
      recipient_country: body.recipient_country,
      receiving_currency: receivingCurrency,
      recipient_type: recipientTypeNumeric,
      quote_type: body.quote_type,
      receiving_amount: body.amount,
      payment_rail: paymentRail,
      source_type: MORPH_WALLET,
      source_id: source.row.id,
      external_type: EXTERNAL_TYPE_MASSIVE,
    };
  }

  // VirtualAccount source.
  if (source.row.currency === receivingCurrency) {
    const tx = await calcTransactionCommissions(
      {
        amount: body.amount,
        receivingCurrency: receivingCurrency,
        paymentRail,
      },
      { userId, merchantId },
    );
    return {
      amount: body.amount,
      total_sending_amount:
        body.amount + tx.commission_amount + tx.merchant_commission_amount,
      fx_rate: "1",
      external_fx_rate: "1",
      internal_fx_rate: "1",
      receiving_amount: body.amount,
      recipient_country: body.recipient_country,
      receiving_currency: receivingCurrency,
      recipient_type: recipientTypeNumeric,
      quote_type: body.quote_type,
      payment_rail: paymentRail,
      source_type: MORPH_VIRTUAL_ACCOUNT,
      source_id: source.row.id,
      external_type: EXTERNAL_TYPE_MASSIVE,
      commission_amount: tx.commission_amount,
      merchant_commission_amount: tx.merchant_commission_amount,
      external_commission_amount: 0,
    };
  }

  // Cross-currency: Resolve provider.
  // Check for FIXED FX fee override first. If set, we skip the Massive
  // API provider call to avoid 189 errors when market quotes aren't needed.
  let driverResp: QuoteDriverResponse;
  const fixedRate = await getFixedRate(
    userId,
    merchantId,
    source.row.currency,
    receivingCurrency,
  );

  if (fixedRate !== null) {
    // Short-circuit: use the fixed rate from database.
    const amt =
      body.quote_type === QUOTE_TYPE_REVERSE
        ? body.amount * fixedRate
        : body.amount;
    const recv =
      body.quote_type === QUOTE_TYPE_REVERSE
        ? body.amount
        : body.amount / fixedRate;

    driverResp = {
      amount: amt,
      receiving_amount: recv,
      fx_rate: fixedRate,
      external_fx_rate: fixedRate,
      quote_type: body.quote_type,
    };
  } else {
    // Normal flow: Hit the external provider (Massive).
    const driver = QuoteFactory.resolve(EXTERNAL_TYPE_MASSIVE);
    const rawDriverResp = await driver.create(
      {
        amount: body.amount,
        from_currency: source.row.currency,
        receiving_currency: receivingCurrency,
        recipient_country: body.recipient_country,
        recipient_type: recipientTypeNumeric,
        quote_type: body.quote_type,
        payment_rail: paymentRail,
        source_id: source.row.id,
        virtual_account_id: source.row.id,
      },
      { id: userId },
    );
    driverResp = applyAedOverrideToQuote(rawDriverResp, source.row.currency);
  }

  const fx = await calcFxCommissions(
    {
      amount: driverResp.amount,
      receivingAmount: driverResp.receiving_amount,
      fxRate: driverResp.fx_rate,
      quoteType: driverResp.quote_type,
      receivingCurrency: receivingCurrency,
      sourceCurrency: source.row.currency,
      paymentRail,
    },
    { userId, merchantId },
  );

  let totalSending = fx.amount;
  let txCommission = { commission_amount: 0, merchant_commission_amount: 0 };
  let externalCommission = 0;

  if (quoteMode === QUOTE_MODE_QUOTATION) {
    txCommission = await calcTransactionCommissions(
      {
        amount: driverResp.amount,
        receivingCurrency: receivingCurrency,
        paymentRail,
      },
      { userId, merchantId },
    );
    // External commission = (external rate - internal rate) * amount.
    externalCommission =
      (driverResp.fx_rate - fx.internal_fx_rate) *
      (body.quote_type === QUOTE_TYPE_REVERSE
        ? driverResp.receiving_amount / driverResp.fx_rate
        : driverResp.amount);
    totalSending =
      fx.amount +
      externalCommission +
      txCommission.commission_amount +
      txCommission.merchant_commission_amount;
  }

  return {
    amount: fx.amount,
    total_sending_amount: totalSending,
    fx_rate: String(fx.fx_rate),
    external_fx_rate: String(driverResp.fx_rate),
    internal_fx_rate: String(fx.internal_fx_rate),
    receiving_amount: fx.receiving_amount,
    commission_value: fx.commission_value,
    commission_amount: txCommission.commission_amount,
    merchant_commission_amount: txCommission.merchant_commission_amount,
    external_commission_amount: externalCommission,
    recipient_country: body.recipient_country,
    receiving_currency: receivingCurrency,
    recipient_type: recipientTypeNumeric,
    quote_type: body.quote_type,
    payment_rail: paymentRail,
    source_type: MORPH_VIRTUAL_ACCOUNT,
    source_id: source.row.id,
    virtual_account_id: source.row.id,
    external_type: EXTERNAL_TYPE_MASSIVE,
    external_reference_id: driverResp.external_reference_id,
    external_data: driverResp.external_data,
    expires_at: driverResp.expires_at,
  };
}

async function persistQuote(
  user: { id: bigint },
  response: Record<string, unknown>,
): Promise<Quote> {
  const data: Prisma.QuoteUncheckedCreateInput = {
    uniqueId: uniqueId(24),
    userId: user.id,
    amount: new Prisma.Decimal(String(response.amount ?? 0)),
    totalSendingAmount: new Prisma.Decimal(String(response.total_sending_amount ?? 0)),
    receivingAmount: new Prisma.Decimal(String(response.receiving_amount ?? 0)),
    commissionAmount: new Prisma.Decimal(String(response.commission_amount ?? 0)),
    merchantCommissionAmount: new Prisma.Decimal(
      String(response.merchant_commission_amount ?? 0),
    ),
    externalCommissionAmount: new Prisma.Decimal(
      String(response.external_commission_amount ?? 0),
    ),
    commissionValue: new Prisma.Decimal(String(response.commission_value ?? 0)),
    fxRate: response.fx_rate ? String(response.fx_rate) : null,
    externalFxRate: response.external_fx_rate ? String(response.external_fx_rate) : null,
    internalFxRate: response.internal_fx_rate ? String(response.internal_fx_rate) : null,
    quoteType: String(response.quote_type),
    recipientType: Number(response.recipient_type),
    recipientCountry: response.recipient_country
      ? String(response.recipient_country)
      : null,
    receivingCurrency: response.receiving_currency
      ? String(response.receiving_currency)
      : null,
    paymentRail: response.payment_rail ? String(response.payment_rail) : null,
    sourceType: response.source_type ? String(response.source_type) : null,
    sourceId: response.source_id as bigint | undefined,
    virtualAccountId: response.virtual_account_id as bigint | undefined,
    externalType: String(response.external_type ?? "ec"),
    externalReferenceId: response.external_reference_id
      ? String(response.external_reference_id)
      : null,
    externalData: response.external_data as Prisma.InputJsonValue | undefined,
    expiresAt: (() => {
      if (!response.expires_at) return null;
      const v = response.expires_at;
      if (typeof v === "number") return new Date(v * 1000);
      if (typeof v === "string" && /^\d+$/.test(v)) return new Date(Number(v) * 1000);
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? null : d;
    })(),
  };
  void ZERO;
  return prisma().quote.create({ data });
}

export const quotesController = (mode: QuoteMode["mode"]) => ({
  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = (req.method === "GET" ? req.query : req.body) as unknown as QuoteStoreInput;
    const merchantId = req.user.merchantId
      ? (await prisma().merchant.findUnique({ where: { id: req.user.merchantId } }))
          ?.id ?? null
      : null;
    const recipientType = USER_TYPE_MAP[body.recipient_type] ?? 1;
    const source = await resolveSource(body, req.user);
    const response = await buildResponse(
      body,
      source,
      req.user.id,
      merchantId,
      mode,
      recipientType,
    );
    const quote = await persistQuote(req.user, response);
    return sendResponse(res, apiSuccess(107), 107, {
      quote: quoteResource(quote),
    });
  },
});
