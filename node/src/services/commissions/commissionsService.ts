import { Prisma } from "@prisma/client";
import {
  DEPOSIT_FEE,
  FEE_TYPE_FIXED,
  FEE_TYPE_FLAT,
  FEE_TYPE_PERCENTAGE,
  FX_FEE,
  MORPH_MERCHANT,
  MORPH_USER,
  QUOTE_TYPE_FORWARD,
  TRANSACTION_FEE,
} from "../../helpers/constants";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";

/**
 * Mirror of App\\Helpers\\CommissionsHelper.
 *
 * Polymorphic Fee table layout:
 *   ownerType=null, ownerId=null  - global default
 *   ownerType=user, ownerId=u.id  - per-user override
 *   ownerType=merchant, ownerId=m - per-merchant override
 *
 * Resolution rules:
 *   - User-level fee always preferred for the user-side line.
 *   - When a merchant exists, the merchant-level fee is preferred for the
 *     merchant-side line, falling back to the global default.
 *   - When no merchant: user-level fee falls back to global default for the
 *     user-side line, and the merchant-side line is zero.
 */

export interface FeeRow {
  feeType: string;
  feeValue: Prisma.Decimal;
  feeName: string;
  mode: string | null;
  currency1: string | null;
  currency2: string | null;
}

interface FeeQuery {
  feeName: string;
  currency1?: string | null;
  currency2?: string | null;
  mode?: string | null;
}

async function findUserFee(
  userId: bigint,
  q: FeeQuery,
): Promise<FeeRow | null> {
  return prisma().fee.findFirst({
    where: {
      ownerType: MORPH_USER,
      ownerId: userId,
      feeName: q.feeName,
      currency1: q.currency1 ?? undefined,
      currency2: q.currency2 ?? undefined,
      mode: q.mode ?? undefined,
    },
    select: {
      feeName: true,
      feeType: true,
      feeValue: true,
      mode: true,
      currency1: true,
      currency2: true,
    },
  });
}

async function findMerchantFee(
  merchantId: bigint,
  q: FeeQuery,
): Promise<FeeRow | null> {
  return prisma().fee.findFirst({
    where: {
      ownerType: MORPH_MERCHANT,
      ownerId: merchantId,
      feeName: q.feeName,
      currency1: q.currency1 ?? undefined,
      currency2: q.currency2 ?? undefined,
      mode: q.mode ?? undefined,
    },
    select: {
      feeName: true,
      feeType: true,
      feeValue: true,
      mode: true,
      currency1: true,
      currency2: true,
    },
  });
}

async function findGlobalFee(q: FeeQuery): Promise<FeeRow | null> {
  return prisma().fee.findFirst({
    where: {
      ownerType: null,
      ownerId: null,
      feeName: q.feeName,
      currency1: q.currency1 ?? undefined,
      currency2: q.currency2 ?? undefined,
      mode: q.mode ?? undefined,
    },
    select: {
      feeName: true,
      feeType: true,
      feeValue: true,
      mode: true,
      currency1: true,
      currency2: true,
    },
  });
}

function calcFlatFee(fee: FeeRow, amount: number): number {
  const t = parseInt(fee.feeType, 10);
  if (t === FEE_TYPE_FLAT) return Number(fee.feeValue);
  if (t === FEE_TYPE_PERCENTAGE) return (amount * Number(fee.feeValue)) / 100;
  return 0;
}

function calcFxFee(
  _fxRate: number,
  fee: FeeRow,
): { amount: number; isFixed: boolean } {
  const t = parseInt(fee.feeType, 10);
  if (t === FEE_TYPE_FIXED) return { amount: Number(fee.feeValue), isFixed: true };
  return { amount: 0, isFixed: false };
}

export async function getFixedRate(
  userId: bigint,
  merchantId: bigint | null,
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  const c1 = fromCurrency.toUpperCase();
  const c2 = toCurrency.toUpperCase();
  const q = { feeName: FX_FEE, currency1: c1, currency2: c2 };

  // 1. User fixed fee
  const userFee = await findUserFee(userId, q);
  if (userFee && parseInt(userFee.feeType, 10) === FEE_TYPE_FIXED) {
    return Number(userFee.feeValue);
  }

  // 2. Merchant fixed fee
  if (merchantId) {
    const merchantFee = await findMerchantFee(merchantId, q);
    if (merchantFee && parseInt(merchantFee.feeType, 10) === FEE_TYPE_FIXED) {
      return Number(merchantFee.feeValue);
    }
  }

  // 3. Global fixed fee fallback
  const globalFee = await findGlobalFee(q);
  if (globalFee && parseInt(globalFee.feeType, 10) === FEE_TYPE_FIXED) {
    return Number(globalFee.feeValue);
  }
  return null;
}

export interface CalcContext {
  userId: bigint;
  merchantId: bigint | null;
  merchantType?: number | null;
}

export interface CalcFxQuoteInput {
  amount: number;
  receivingAmount: number;
  fxRate: number;
  quoteType: string;
  receivingCurrency: string;
  sourceCurrency: string;
  paymentRail?: string | null;
}

export interface CalcFxResult {
  commission_value: number;
  fx_rate: number;
  internal_fx_rate: number;
  receiving_amount: number;
  amount: number;
}

/**
 * Mirror of CommissionsHelper::calc_fx_commissions.
 */
export async function calcFxCommissions(
  q: CalcFxQuoteInput,
  ctx: CalcContext,
): Promise<CalcFxResult> {
  const baseRate = q.fxRate;
  const c1 = q.sourceCurrency.toUpperCase();
  const c2 = q.receivingCurrency.toUpperCase();

  const isWhitelabel = ctx.merchantId !== null && ctx.merchantType === 2;

  let userCommission = 0;
  let merchantCommission = 0;
  let isUserFixed = false;
  let isMerchantFixed = false;

  let userFee = null;
  if (isWhitelabel) {
    userFee = await findUserFee(ctx.userId, {
      feeName: FX_FEE,
      currency1: c1,
      currency2: c2,
    });
  } else {
    // Direct User or Payout Merchant: check only with user_id, fallback to global
    userFee = await findUserFee(ctx.userId, {
      feeName: FX_FEE,
      currency1: c1,
      currency2: c2,
    });
    if (!userFee) {
      userFee = await findGlobalFee({ feeName: FX_FEE, currency1: c1, currency2: c2 });
    }
  }

  if (userFee && Number(userFee.feeValue) > 0) {
    const r = calcFxFee(baseRate, userFee);
    userCommission = r.amount;
    isUserFixed = r.isFixed;
  }

  if (isWhitelabel) {
    let merchantFee = await findMerchantFee(ctx.merchantId!, {
      feeName: FX_FEE,
      currency1: c1,
      currency2: c2,
    });
    if (!merchantFee) {
      merchantFee = await findGlobalFee({ feeName: FX_FEE, currency1: c1, currency2: c2 });
    }
    if (merchantFee && Number(merchantFee.feeValue) > 0) {
      const r = calcFxFee(baseRate, merchantFee);
      merchantCommission = r.amount;
      isMerchantFixed = r.isFixed;
    }
  }

  if (isUserFixed || isMerchantFixed) {
    const fixedRate = isUserFixed ? userCommission : merchantCommission;
    const sendingAmount =
      q.quoteType === QUOTE_TYPE_FORWARD ? q.amount : q.receivingAmount / fixedRate;
    const receivingAmount =
      q.quoteType === QUOTE_TYPE_FORWARD ? q.amount * fixedRate : q.receivingAmount;
    return {
      commission_value: 0,
      fx_rate: fixedRate,
      internal_fx_rate: fixedRate,
      receiving_amount: receivingAmount,
      amount: sendingAmount,
    };
  }

  let internalFxRate: number;
  let finalFxRate: number;
  let totalCommission: number;
  if (isWhitelabel && userFee) {
    internalFxRate = baseRate - merchantCommission;
    finalFxRate = baseRate - (merchantCommission + userCommission);
    totalCommission = merchantCommission + userCommission;
  } else if (isWhitelabel) {
    internalFxRate = baseRate - merchantCommission;
    finalFxRate = internalFxRate;
    totalCommission = merchantCommission;
  } else {
    internalFxRate = baseRate - userCommission;
    finalFxRate = internalFxRate;
    totalCommission = userCommission;
  }

  const sendingAmount =
    q.quoteType === QUOTE_TYPE_FORWARD ? q.amount : q.receivingAmount / finalFxRate;
  const receivingAmount =
    q.quoteType === QUOTE_TYPE_FORWARD ? q.amount * finalFxRate : q.receivingAmount;

  return {
    commission_value: totalCommission,
    fx_rate: finalFxRate,
    internal_fx_rate: internalFxRate,
    receiving_amount: receivingAmount,
    amount: sendingAmount,
  };
}

export interface CalcTransactionInput {
  amount: number;
  receivingCurrency: string;
  sourceCurrency: string;
  paymentRail?: string | null;
  sourceType?: string | null;
}

export interface CalcTransactionResult {
  commission_amount: number;
  merchant_commission_amount: number;
}

/**
 * Mirror of CommissionsHelper::calc_transaction_commissions.
 */
export async function calcTransactionCommissions(
  q: CalcTransactionInput,
  ctx: CalcContext,
): Promise<CalcTransactionResult> {
  const lookupCurrency = q.receivingCurrency.toUpperCase();
  const currency2 = q.sourceType === "wallet" ? lookupCurrency : null;
  const isWhitelabel = ctx.merchantId !== null && ctx.merchantType === 2;

  if (isWhitelabel) {
    const userFee = await findUserFee(ctx.userId, {
      feeName: TRANSACTION_FEE,
      currency1: lookupCurrency,
      currency2: currency2,
      mode: q.paymentRail ?? null,
    });
    let merchantCommissionAmount = 0;
    if (userFee) {
      merchantCommissionAmount = calcFlatFee(userFee, q.amount);
    }

    let merchantFee = await findMerchantFee(ctx.merchantId!, {
      feeName: TRANSACTION_FEE,
      currency1: lookupCurrency,
      currency2: currency2,
      mode: q.paymentRail ?? null,
    });
    if (!merchantFee) {
      merchantFee = await findGlobalFee({
        feeName: TRANSACTION_FEE,
        currency1: lookupCurrency,
        currency2: currency2,
        mode: q.paymentRail ?? null,
      });
    }
    let commissionAmount = 0;
    if (merchantFee) {
      commissionAmount = calcFlatFee(merchantFee, q.amount);
    }

    return {
      commission_amount: commissionAmount,
      merchant_commission_amount: merchantCommissionAmount,
    };
  } else {
    let userFee = await findUserFee(ctx.userId, {
      feeName: TRANSACTION_FEE,
      currency1: lookupCurrency,
      currency2: currency2,
      mode: q.paymentRail ?? null,
    });
    if (!userFee) {
      userFee = await findGlobalFee({
        feeName: TRANSACTION_FEE,
        currency1: lookupCurrency,
        currency2: currency2,
        mode: q.paymentRail ?? null,
      });
    }
    let commissionAmount = 0;
    if (userFee) {
      commissionAmount = calcFlatFee(userFee, q.amount);
    }
    return {
      commission_amount: commissionAmount,
      merchant_commission_amount: 0,
    };
  }
}

/**
 * Mirror of CommissionsHelper::calc_deposit_commissions.
 */
export async function calcDepositCommissions(
  ctx: CalcContext,
  amount: number,
  currency: string,
): Promise<CalcTransactionResult> {
  const out: CalcTransactionResult = {
    commission_amount: 0,
    merchant_commission_amount: 0,
  };
  const cur = currency.toUpperCase();
  const isWhitelabel = ctx.merchantId !== null && ctx.merchantType === 2;

  if (isWhitelabel) {
    // Whitelabel: Apply BOTH User Fee (no fallback) and Merchant Fee (with global fallback)
    const userFee = await findUserFee(ctx.userId, {
      feeName: DEPOSIT_FEE,
      currency1: cur,
    });
    if (userFee) {
      out.merchant_commission_amount = calcFlatFee(userFee, amount);
    }

    let merchantFee = await findMerchantFee(ctx.merchantId!, {
      feeName: DEPOSIT_FEE,
      currency1: cur,
    });
    if (!merchantFee) {
      merchantFee = await findGlobalFee({ feeName: DEPOSIT_FEE, currency1: cur });
    }
    if (merchantFee) {
      out.commission_amount = calcFlatFee(merchantFee, amount);
    }
  } else {
    // Direct User or Payout Merchant: check only with user_id, fallback to global
    let userFee = await findUserFee(ctx.userId, {
      feeName: DEPOSIT_FEE,
      currency1: cur,
    });
    if (!userFee) {
      userFee = await findGlobalFee({ feeName: DEPOSIT_FEE, currency1: cur });
    }
    if (userFee) {
      out.commission_amount = calcFlatFee(userFee, amount);
    }
  }
  return out;
}

/**
 * Validate that a virtual account exists - mirrors the throw in
 * CommissionsHelper::calc_fx_commissions when the source row is missing.
 */
export async function requireVirtualAccount(sourceId: bigint): Promise<{
  id: bigint;
  currency: string;
}> {
  const va = await prisma().virtualAccount.findUnique({
    where: { id: sourceId },
    select: { id: true, currency: true },
  });
  if (!va) throw new ApiException(116);
  return va;
}
