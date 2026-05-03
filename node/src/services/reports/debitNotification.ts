import { BeneficiaryTransaction, Quote } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import { ApiException } from "../../helpers/errors";
import {
  BENEFICIARY_TRANSACTION_COMPLETED,
  EXTERNAL_CALL_FOR_DEBIT,
  EXTERNAL_TYPE_DIGININE,
  EXTERNAL_TYPE_VIYONA_PAY,
  MORPH_VIRTUAL_ACCOUNT,
} from "../../helpers/constants";
import { reportPost } from "./reportClient";

/**
 * Mirror of App\\Actions\\BeneficiaryTransaction\\SendDebitNotification.
 *
 * Posts a debit notification to the Reports microservice when a payout
 * completes. ViyonaPay and Diginine each have their own payload shape;
 * other rails fall through to the ViyonaPay-style payload.
 *
 * Eligibility gate: txn.status MUST be COMPLETED. Anything else is a
 * silent skip (mirrors Laravel `transaction_not_eligible_for_debit_request`).
 */

interface MidIdSecret {
  VIYONAPAY?: string;
  DIGININE?: string;
}

let midIds: MidIdSecret | null = null;
async function loadMidIds(): Promise<MidIdSecret> {
  if (midIds) return midIds;
  // The MID accounts live alongside the Reports server config since
  // they identify the Reports-server-side wallet pairs we're posting to.
  const { Secrets } = await import("../../config/secrets");
  midIds = await Secrets.external<MidIdSecret & Record<string, unknown>>(
    "report_server",
  );
  return midIds;
}

export async function sendDebitNotification(
  beneficiaryTransactionId: bigint,
): Promise<void> {
  const txn = await prisma().beneficiaryTransaction.findUnique({
    where: { id: beneficiaryTransactionId },
  });
  if (!txn) {
    logger.warn(
      { beneficiaryTransactionId: beneficiaryTransactionId.toString() },
      "SendDebitNotification - transaction not found",
    );
    return;
  }
  if (txn.status !== BENEFICIARY_TRANSACTION_COMPLETED) {
    logger.info(
      { txnId: txn.uniqueId, status: txn.status },
      "SendDebitNotification - transaction not eligible (not COMPLETED)",
    );
    return;
  }

  try {
    const payload = await buildPayload(txn);
    if (!payload) {
      logger.warn(
        { txnId: txn.uniqueId },
        "SendDebitNotification - cannot build payload",
      );
      return;
    }
    const res = await reportPost("api/debit_transactions", payload, {
      callFor: EXTERNAL_CALL_FOR_DEBIT,
      referenceType: "App\\Models\\BeneficiaryTransaction",
      referenceId: txn.id,
    });
    if (!res.ok) {
      logger.warn(
        { txnId: txn.uniqueId, status: res.status, body: res.body },
        "SendDebitNotification - Reports server rejected",
      );
      return;
    }
    logger.info(
      { txnId: txn.uniqueId },
      "SendDebitNotification - SUCCESS",
    );
  } catch (err) {
    logger.error(
      { err, txnId: txn.uniqueId },
      "SendDebitNotification - threw",
    );
  }
}

async function buildPayload(txn: BeneficiaryTransaction): Promise<Record<string, unknown> | null> {
  const user = await prisma().user.findUnique({ where: { id: txn.userId } });
  if (!user) throw new ApiException(102);
  const merchant = user.merchantId
    ? await prisma().merchant.findUnique({
        where: { uniqueId: user.merchantId },
        select: { uniqueId: true },
      })
    : null;
  const quote = txn.quoteId
    ? await prisma().quote.findUnique({ where: { id: txn.quoteId } })
    : null;
  const sourceCurrency = await resolveSourceCurrency(quote);

  const midIdMap = await loadMidIds();
  const midId =
    txn.externalType === EXTERNAL_TYPE_VIYONA_PAY
      ? midIdMap.VIYONAPAY ?? "--"
      : txn.externalType === EXTERNAL_TYPE_DIGININE
        ? midIdMap.DIGININE ?? "--"
        : "--";

  if (txn.externalType === EXTERNAL_TYPE_DIGININE) {
    return buildDiginine(txn, merchant?.uniqueId ?? null, midId, sourceCurrency, quote);
  }
  // Default + ViyonaPay use the same VP payload shape.
  return buildViyonaPay(txn, merchant?.uniqueId ?? null, midId, sourceCurrency, quote);
}

async function resolveSourceCurrency(quote: Quote | null): Promise<string | null> {
  if (!quote || !quote.sourceType || !quote.sourceId) return null;
  if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT) {
    const va = await prisma().virtualAccount.findUnique({
      where: { id: quote.sourceId },
      select: { currency: true },
    });
    return va?.currency ?? null;
  }
  const wallet = await prisma().wallet.findUnique({
    where: { id: quote.sourceId },
    select: { currency: true },
  });
  return wallet?.currency ?? null;
}

function buildViyonaPay(
  txn: BeneficiaryTransaction,
  merchantId: string | null,
  midId: string,
  sourceCurrency: string | null,
  quote: Quote | null,
): Record<string, unknown> {
  if (!sourceCurrency) {
    throw new Error("vp_transaction_source_currency_not_found");
  }
  return {
    reference_id: txn.externalReferenceId ?? null,
    merchant_id: merchantId,
    mid_id: midId,
    source_currency: sourceCurrency,
    source_amount: Number(txn.amount ?? 0),
    destination_currency: txn.receivingCurrency ?? "--",
    destination_amount: Number(txn.recipientAmount ?? 0),
    mid_wallet: {
      currency: "INR",
      debit_amount: Number(txn.recipientAmount ?? 0),
      fees: vpFees(txn.rail),
    },
    merchant_wallet: {
      currency: sourceCurrency,
      debit_amount: Number(txn.amount ?? 0),
      fees: Number(txn.commissionAmount ?? 0),
    },
    exchange_rate: quote?.fxRate ?? "--",
    remarks: txn.remarks ?? "--",
    transaction_date: txn.createdAt.toISOString().slice(0, 10),
  };
}

function vpFees(rail: string | null): number {
  switch (rail) {
    case "IMPS":
      return 5.9;
    case "NEFT":
    case "RTGS":
      return 0;
    default:
      return 0;
  }
}

function buildDiginine(
  txn: BeneficiaryTransaction,
  merchantId: string | null,
  midId: string,
  baseSourceCurrency: string | null,
  quote: Quote | null,
): Record<string, unknown> {
  if (!baseSourceCurrency) {
    throw new Error("d9_transaction_source_currency_not_found");
  }
  const externalData = (txn.externalData ?? {}) as Record<string, unknown>;
  const txData =
    typeof externalData.transaction === "object" && externalData.transaction !== null
      ? (externalData.transaction as Record<string, unknown>)
      : {};
  let sourceCurrency = (txData.sending_currency_code as string | undefined) ?? null;
  const destinationCurrency =
    (txData.receiving_currency_code as string | undefined) ?? null;
  if (!sourceCurrency) throw new Error("d9_transaction_source_currency_not_found");
  if (!destinationCurrency) {
    throw new Error("d9_transaction_destination_currency_not_found");
  }

  let sourceAmount = Number(txData.sending_amount ?? 0);
  let merchantWalletDebit = sourceAmount;
  const midWalletDebit = sourceAmount;

  const feeDetails = Array.isArray(txData.fee_details)
    ? (txData.fee_details as Array<{ amount?: number | string }>)
    : [];
  let fees = feeDetails.reduce((s, f) => s + Number(f.amount ?? 0), 0);
  const midWalletFees = fees;
  const destinationAmount =
    (txData.receiving_amount as number | undefined) ??
    Number(txn.recipientAmount ?? 0);

  const fxRates = Array.isArray(txData.fx_rates)
    ? (txData.fx_rates as Array<{ base_currency_code?: string; rate?: number }>)
    : [];
  const serviceExchangeRate =
    fxRates.find((r) => r.base_currency_code === sourceCurrency)?.rate ?? null;

  let midWalletCurrency = sourceCurrency;
  let merchantWalletCurrency = baseSourceCurrency;

  if (baseSourceCurrency === "AED") {
    merchantWalletCurrency = baseSourceCurrency;
    sourceCurrency = baseSourceCurrency;
    sourceAmount = Number(txn.amount ?? 0);
    merchantWalletDebit = sourceAmount;
    fees = Number(txn.commissionAmount ?? 0);
    midWalletCurrency = baseSourceCurrency;
  }

  return {
    reference_id: txn.externalReferenceId ?? null,
    merchant_id: merchantId,
    mid_id: midId,
    source_currency: sourceCurrency,
    source_amount: sourceAmount,
    destination_currency: destinationCurrency,
    destination_amount: destinationAmount,
    mid_wallet: {
      currency: midWalletCurrency,
      debit_amount: midWalletDebit,
      fees: midWalletFees,
    },
    merchant_wallet: {
      currency: merchantWalletCurrency,
      debit_amount: merchantWalletDebit,
      fees,
    },
    exchange_rate: quote?.fxRate ?? "--",
    service_exchange_rate: serviceExchangeRate,
    remarks: txn.remarks ?? "--",
    transaction_date: txn.createdAt
      .toISOString()
      .replace("T", " ")
      .slice(0, 19),
  };
}
