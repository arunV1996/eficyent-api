import Fee from "../models/fee.model";
import VirtualAccount from "../models/virtual_account.model";
import { CodedError } from "./coded_error.helper";
import {
    DEPOSIT_FEE,
    FEE_TYPE_FIXED,
    FEE_TYPE_FLAT,
    FEE_TYPE_PERCENTAGE,
    FX_FEE,
    MERCHANT_TYPE_WHITELABEL,
    MORPH_MERCHANT,
    MORPH_USER,
    MORPH_WALLET,
    QUOTE_TYPE_FORWARD,
    TRANSACTION_FEE,
} from "../utils/constants";

/**
 * Mirror of App\Helpers\CommissionsHelper (via the legacy
 * commissionsService). Polymorphic Fee table layout:
 *   ownerType=null,     ownerId=null  -> global default
 *   ownerType=User,     ownerId=u.id  -> per-user override
 *   ownerType=Merchant, ownerId=m.id  -> per-merchant override
 *
 * IMPORTANT filter semantic preserved from the legacy Prisma queries:
 * a null/undefined currency or mode OMITS the filter entirely (matches
 * any value) — it does NOT match only NULL columns.
 */

export interface FeeRow {
    feeType: string;
    feeValue: string;
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

const feeWhereFromQuery = (
    feeQuery: FeeQuery,
): Record<string, unknown> => {
    const whereClause: Record<string, unknown> = {
        feeName: feeQuery.feeName,
    };
    if (feeQuery.currency1 !== null && feeQuery.currency1 !== undefined) {
        whereClause.currency1 = feeQuery.currency1;
    }
    if (feeQuery.currency2 !== null && feeQuery.currency2 !== undefined) {
        whereClause.currency2 = feeQuery.currency2;
    }
    if (feeQuery.mode !== null && feeQuery.mode !== undefined) {
        whereClause.mode = feeQuery.mode;
    }
    return whereClause;
};

const toFeeRow = (fee: Fee | null): FeeRow | null => {
    if (!fee) {
        return null;
    }
    return {
        feeType: fee.feeType,
        feeValue: fee.feeValue,
        feeName: fee.feeName,
        mode: fee.mode,
        currency1: fee.currency1,
        currency2: fee.currency2,
    };
};

const findUserFee = async (
    userId: number,
    feeQuery: FeeQuery,
): Promise<FeeRow | null> => {
    return toFeeRow(
        await Fee.findOne({
            where: {
                ownerType: MORPH_USER,
                ownerId: userId,
                ...feeWhereFromQuery(feeQuery),
            },
        }),
    );
};

const findMerchantFee = async (
    merchantId: number,
    feeQuery: FeeQuery,
): Promise<FeeRow | null> => {
    return toFeeRow(
        await Fee.findOne({
            where: {
                ownerType: MORPH_MERCHANT,
                ownerId: merchantId,
                ...feeWhereFromQuery(feeQuery),
            },
        }),
    );
};

const findGlobalFee = async (feeQuery: FeeQuery): Promise<FeeRow | null> => {
    return toFeeRow(
        await Fee.findOne({
            where: {
                ownerType: null,
                ownerId: null,
                ...feeWhereFromQuery(feeQuery),
            },
        }),
    );
};

const calcFlatFee = (fee: FeeRow, amount: number): number => {
    const feeType = parseInt(fee.feeType, 10);
    if (feeType === FEE_TYPE_FLAT) {
        return Number(fee.feeValue);
    }
    if (feeType === FEE_TYPE_PERCENTAGE) {
        return (amount * Number(fee.feeValue)) / 100;
    }
    return 0;
};

const calcFxFee = (
    fxRate: number,
    fee: FeeRow,
): { amount: number; isFixed: boolean } => {
    const feeType = parseInt(fee.feeType, 10);
    if (feeType === FEE_TYPE_FLAT) {
        return { amount: Number(fee.feeValue), isFixed: false };
    }
    if (feeType === FEE_TYPE_PERCENTAGE) {
        return { amount: (fxRate * Number(fee.feeValue)) / 100, isFixed: false };
    }
    if (feeType === FEE_TYPE_FIXED) {
        return { amount: Number(fee.feeValue), isFixed: true };
    }
    return { amount: 0, isFixed: false };
};

/**
 * FIXED-type FX fee override for a currency pair, resolved
 * User -> Merchant -> global. Returns null when none exists.
 */
export const getFixedRate = async (
    userId: number,
    merchantId: number | null,
    fromCurrency: string,
    toCurrency: string,
): Promise<number | null> => {
    const feeQuery = {
        feeName: FX_FEE,
        currency1: fromCurrency.toUpperCase(),
        currency2: toCurrency.toUpperCase(),
    };

    const userFee = await findUserFee(userId, feeQuery);
    if (userFee && parseInt(userFee.feeType, 10) === FEE_TYPE_FIXED) {
        return Number(userFee.feeValue);
    }

    if (merchantId) {
        const merchantFee = await findMerchantFee(merchantId, feeQuery);
        if (merchantFee && parseInt(merchantFee.feeType, 10) === FEE_TYPE_FIXED) {
            return Number(merchantFee.feeValue);
        }
    }

    const globalFee = await findGlobalFee(feeQuery);
    if (globalFee && parseInt(globalFee.feeType, 10) === FEE_TYPE_FIXED) {
        return Number(globalFee.feeValue);
    }
    return null;
};

export interface CalcContext {
    userId: number;
    merchantId: number | null;
    merchantType?: number | null;
}

export interface CalcFxQuoteInput {
    amount: number;
    receivingAmount: number;
    fxRate: number;
    quoteType: string;
    receivingCurrency: string;
    sourceCurrency: string;
    sourceId: number;
    paymentRail?: string | null;
}

export interface CalcFxResult {
    commission_value: number;
    fx_rate: number;
    internal_fx_rate: number;
    receiving_amount: number;
    amount: number;
}

const requireVirtualAccount = async (
    sourceId: number,
): Promise<{ id: number; currency: string }> => {
    const virtualAccount = await VirtualAccount.findByPk(sourceId, {
        attributes: ["id", "currency"],
    });
    if (!virtualAccount) {
        throw new CodedError("Virtual account not found.", 116, 400);
    }
    return { id: virtualAccount.id, currency: virtualAccount.currency };
};

/**
 * Mirror of CommissionsHelper::calc_fx_commissions.
 */
export const calcFxCommissions = async (
    quoteInput: CalcFxQuoteInput,
    context: CalcContext,
    overrideFxRate?: number | null,
): Promise<CalcFxResult> => {
    if (overrideFxRate !== undefined && overrideFxRate !== null) {
        return {
            commission_value: 0,
            fx_rate: overrideFxRate,
            internal_fx_rate: overrideFxRate,
            receiving_amount: quoteInput.amount * overrideFxRate,
            amount: quoteInput.amount,
        };
    }

    const baseRate = quoteInput.fxRate;
    const virtualAccount = await requireVirtualAccount(quoteInput.sourceId);
    const currency1 = virtualAccount.currency.toUpperCase();
    const currency2 = quoteInput.receivingCurrency.toUpperCase();

    const hasMerchant = context.merchantId !== null;

    let userCommission = 0;
    let merchantCommission = 0;
    let isUserFixed = false;
    let isMerchantFixed = false;

    let userFee: FeeRow | null = null;
    if (!hasMerchant) {
        userFee = await findUserFee(context.userId, {
            feeName: FX_FEE,
            currency1,
            currency2,
        });
        if (!userFee) {
            userFee = await findGlobalFee({
                feeName: FX_FEE,
                currency1,
                currency2,
            });
        }
    }

    if (userFee && Number(userFee.feeValue) > 0) {
        const feeResult = calcFxFee(baseRate, userFee);
        userCommission = feeResult.amount;
        isUserFixed = feeResult.isFixed;
    }

    if (hasMerchant) {
        let merchantFee = await findMerchantFee(context.merchantId!, {
            feeName: FX_FEE,
            currency1,
            currency2,
        });
        if (!merchantFee) {
            merchantFee = await findGlobalFee({
                feeName: FX_FEE,
                currency1,
                currency2,
            });
        }
        if (merchantFee && Number(merchantFee.feeValue) > 0) {
            const feeResult = calcFxFee(baseRate, merchantFee);
            merchantCommission = feeResult.amount;
            isMerchantFixed = feeResult.isFixed;
        }
    }

    if (isUserFixed || isMerchantFixed) {
        const fixedRate = isUserFixed ? userCommission : merchantCommission;
        const sendingAmount =
            quoteInput.quoteType === QUOTE_TYPE_FORWARD
                ? quoteInput.amount
                : quoteInput.receivingAmount / fixedRate;
        const receivingAmount =
            quoteInput.quoteType === QUOTE_TYPE_FORWARD
                ? quoteInput.amount * fixedRate
                : quoteInput.receivingAmount;
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
    if (hasMerchant && userFee) {
        internalFxRate = baseRate - merchantCommission;
        finalFxRate = baseRate - (merchantCommission + userCommission);
        totalCommission = merchantCommission + userCommission;
    } else if (hasMerchant) {
        internalFxRate = baseRate - merchantCommission;
        finalFxRate = internalFxRate;
        totalCommission = merchantCommission;
    } else {
        internalFxRate = baseRate - userCommission;
        finalFxRate = internalFxRate;
        totalCommission = userCommission;
    }

    const sendingAmount =
        quoteInput.quoteType === QUOTE_TYPE_FORWARD
            ? quoteInput.amount
            : quoteInput.receivingAmount / finalFxRate;
    const receivingAmount =
        quoteInput.quoteType === QUOTE_TYPE_FORWARD
            ? quoteInput.amount * finalFxRate
            : quoteInput.receivingAmount;

    return {
        commission_value: totalCommission,
        fx_rate: finalFxRate,
        internal_fx_rate: internalFxRate,
        receiving_amount: receivingAmount,
        amount: sendingAmount,
    };
};

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
export const calcTransactionCommissions = async (
    transactionInput: CalcTransactionInput,
    context: CalcContext,
): Promise<CalcTransactionResult> => {
    const lookupCurrency = transactionInput.receivingCurrency.toUpperCase();
    const currency2 =
        transactionInput.sourceType === "wallet" ||
        transactionInput.sourceType === MORPH_WALLET
            ? lookupCurrency
            : null;
    const mode =
        lookupCurrency === "USD"
            ? (transactionInput.paymentRail ?? null)
            : null;
    const hasMerchant = context.merchantId !== null;

    let userFee: FeeRow | null = null;
    if (!hasMerchant) {
        userFee = await findUserFee(context.userId, {
            feeName: TRANSACTION_FEE,
            currency1: lookupCurrency,
            currency2,
            mode,
        });
        if (!userFee) {
            userFee = await findGlobalFee({
                feeName: TRANSACTION_FEE,
                currency1: lookupCurrency,
                currency2,
                mode,
            });
        }
    }

    let merchantCommissionAmount = 0;
    if (userFee) {
        merchantCommissionAmount = calcFlatFee(userFee, transactionInput.amount);
    }

    let commissionAmount = 0;

    if (hasMerchant) {
        const isWhitelabel = context.merchantType === MERCHANT_TYPE_WHITELABEL;
        if (isWhitelabel) {
            const generalFee = await findGlobalFee({
                feeName: TRANSACTION_FEE,
                currency1: lookupCurrency,
                currency2,
                mode,
            });
            const merchantFee = await findMerchantFee(context.merchantId!, {
                feeName: TRANSACTION_FEE,
                currency1: lookupCurrency,
                currency2,
                mode,
            });
            const generalFeeAmount = generalFee
                ? calcFlatFee(generalFee, transactionInput.amount)
                : 0;
            const merchantFeeAmount = merchantFee
                ? calcFlatFee(merchantFee, transactionInput.amount)
                : 0;
            commissionAmount = generalFeeAmount + merchantFeeAmount;
        } else {
            let merchantFee = await findMerchantFee(context.merchantId!, {
                feeName: TRANSACTION_FEE,
                currency1: lookupCurrency,
                currency2,
                mode,
            });
            if (!merchantFee) {
                merchantFee = await findGlobalFee({
                    feeName: TRANSACTION_FEE,
                    currency1: lookupCurrency,
                    currency2,
                    mode,
                });
            }
            if (merchantFee) {
                commissionAmount = calcFlatFee(
                    merchantFee,
                    transactionInput.amount,
                );
            }
        }
    }

    if (!hasMerchant) {
        commissionAmount = merchantCommissionAmount + commissionAmount;
        merchantCommissionAmount = 0;
    }

    return {
        commission_amount: commissionAmount,
        merchant_commission_amount: merchantCommissionAmount,
    };
};

/**
 * Mirror of CommissionsHelper::calc_deposit_commissions.
 */
export const calcDepositCommissions = async (
    context: CalcContext,
    amount: number,
    currency: string,
): Promise<CalcTransactionResult> => {
    const lookupCurrency = currency.toUpperCase();
    const hasMerchant = context.merchantId !== null;

    let userFee: FeeRow | null = null;
    if (!hasMerchant) {
        userFee = await findUserFee(context.userId, {
            feeName: DEPOSIT_FEE,
            currency1: lookupCurrency,
        });
        if (!userFee) {
            userFee = await findGlobalFee({
                feeName: DEPOSIT_FEE,
                currency1: lookupCurrency,
            });
        }
    }

    let merchantCommissionAmount = 0;
    if (userFee) {
        merchantCommissionAmount = calcFlatFee(userFee, amount);
    }

    let commissionAmount = 0;

    if (hasMerchant) {
        const isWhitelabel = context.merchantType === MERCHANT_TYPE_WHITELABEL;
        if (isWhitelabel) {
            const generalFee = await findGlobalFee({
                feeName: DEPOSIT_FEE,
                currency1: lookupCurrency,
            });
            const merchantFee = await findMerchantFee(context.merchantId!, {
                feeName: DEPOSIT_FEE,
                currency1: lookupCurrency,
            });
            const generalFeeAmount = generalFee
                ? calcFlatFee(generalFee, amount)
                : 0;
            const merchantFeeAmount = merchantFee
                ? calcFlatFee(merchantFee, amount)
                : 0;
            commissionAmount = generalFeeAmount + merchantFeeAmount;
        } else {
            let merchantFee = await findMerchantFee(context.merchantId!, {
                feeName: DEPOSIT_FEE,
                currency1: lookupCurrency,
            });
            if (!merchantFee) {
                merchantFee = await findGlobalFee({
                    feeName: DEPOSIT_FEE,
                    currency1: lookupCurrency,
                });
            }
            if (merchantFee) {
                commissionAmount = calcFlatFee(merchantFee, amount);
            }
        }
    }

    if (!hasMerchant) {
        commissionAmount = merchantCommissionAmount + commissionAmount;
        merchantCommissionAmount = 0;
    }

    return {
        commission_amount: commissionAmount,
        merchant_commission_amount: merchantCommissionAmount,
    };
};
