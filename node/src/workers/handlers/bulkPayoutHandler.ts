import { Job } from "bullmq";
import { prisma } from "../../db/prisma";
import { logger } from "../../helpers/logger";
import {
  BUSINESS_MODEL_DEAL_BASED,
  PAYOUT_JOB_STATUS_COMPLETED,
  PAYOUT_JOB_STATUS_FAILED,
  PAYOUT_JOB_STATUS_PROCESSING,
  QUOTE_MODE_QUOTATION,
  QUOTE_TYPE_REVERSE,
} from "../../helpers/constants";
import { BulkPayoutJobPayload } from "../../queues/dispatchers";
import { uniqueId } from "../../helpers/uniqueId";
import { getVirtualAccountScope } from "../../services/virtualAccounts/virtualAccountService";
import { getBusinessModel } from "../../services/merchants/merchantService";
import { resolveSource, buildResponse, persistQuote } from "../../controllers/quotes/quotesController";
import { createPayoutTransaction } from "../../services/beneficiaryTransactions/beneficiaryTransactionService";
import { QuoteStoreInput } from "../../validators/quotes/quoteValidators";

function cleanDbField(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  const lower = s.toLowerCase();
  if (
    lower === "" ||
    lower === "undefined" ||
    lower === "null" ||
    lower === "n/a" ||
    lower === "na"
  ) {
    return null;
  }
  return s;
}

export async function processBulkPayout(
  job: Job<BulkPayoutJobPayload>,
): Promise<void> {
  const { payoutJobUniqueId, userId } = job.data;
  const reqLogger = logger.child({
    queue: "bulk-payout",
    jobId: job.id,
    payoutJobUniqueId,
    userId,
  });

  reqLogger.info("Starting bulk payout processing");

  try {
    const payoutJob = await prisma().payoutJob.findUnique({
      where: { uniqueId: payoutJobUniqueId },
    });
    if (!payoutJob) {
      reqLogger.error("PayoutJob not found");
      return;
    }
    if (Number(payoutJob.status) === PAYOUT_JOB_STATUS_COMPLETED) {
      reqLogger.info("PayoutJob already completed");
      return;
    }

    await prisma().payoutJob.update({
      where: { id: payoutJob.id },
      data: {
        status: PAYOUT_JOB_STATUS_PROCESSING,
        attempts: { increment: 1 },
      },
    });

    const user = await prisma().user.findUnique({
      where: { id: payoutJob.userId },
    });
    if (!user) {
      throw new Error(`User not found: ${payoutJob.userId}`);
    }

    const merchant = user.merchantId
      ? await prisma().merchant.findUnique({ where: { id: user.merchantId } })
      : null;

    const payload = payoutJob.payload as any;
    const beneficiaryPayload = payload.beneficiary;
    const remitterPayload = payload.remitter;
    const transactionPayloadData = payload.transaction;

    // 1. Beneficiary lookup / creation
    const beneficiaryEmail = beneficiaryPayload.beneficiaryAccount.email
      ? String(beneficiaryPayload.beneficiaryAccount.email).trim()
      : null;
    const accountNumber = String(beneficiaryPayload.beneficiaryAccount.account_number).trim();
    const currency = String(beneficiaryPayload.beneficiaryAccount.currency ?? "").trim();

    // Always look up by accountNumber + currency (the real unique key for a
    // bank account). Email is included as an extra filter only when present —
    // mirroring how the sender is deduped by idNumber regardless of other fields.
    let beneficiaryAccount = await prisma().beneficiaryAccount.findFirst({
      where: {
        userId: user.id,
        accountNumber,
        currency,
        deletedAt: null,
        ...(beneficiaryEmail ? { email: beneficiaryEmail } : {}),
      },
    });

    if (!beneficiaryAccount) {
      beneficiaryAccount = await prisma().beneficiaryAccount.create({
        data: {
          uniqueId: uniqueId(24),
          userId: user.id,
          type: typeof beneficiaryPayload.beneficiaryAccount.type === "number"
            ? beneficiaryPayload.beneficiaryAccount.type
            : null,
          country: String(beneficiaryPayload.beneficiaryAccount.country ?? "US"),
          currency,
          firstName: cleanDbField(beneficiaryPayload.beneficiaryAccount.first_name),
          middleName: cleanDbField(beneficiaryPayload.beneficiaryAccount.middle_name),
          lastName: cleanDbField(beneficiaryPayload.beneficiaryAccount.last_name),
          email: beneficiaryEmail,
          mobileCountryCode: cleanDbField(beneficiaryPayload.beneficiaryAccount.mobile_country_code),
          mobile: cleanDbField(beneficiaryPayload.beneficiaryAccount.mobile),
          accountNumber: accountNumber,
          accountName: cleanDbField(beneficiaryPayload.beneficiaryAccount.account_name),
          bankName: cleanDbField(beneficiaryPayload.beneficiaryAccount.bank_name),
          paymentRail: cleanDbField(beneficiaryPayload.beneficiaryAccount.payment_rail),
          routingNumber: cleanDbField(beneficiaryPayload.beneficiaryAccount.routing_number),
          swiftCode: cleanDbField(beneficiaryPayload.beneficiaryAccount.swift_code),
          iban: cleanDbField(beneficiaryPayload.beneficiaryAccount.iban),
          businessName: cleanDbField(beneficiaryPayload.beneficiaryAccount.business_name),
          businessCountry: cleanDbField(beneficiaryPayload.beneficiaryAccount.business_country),
          status: 1,
        },
      });

      const addDetail = beneficiaryPayload.beneficiaryAccountAdditionalDetail as Record<string, unknown>;
      await prisma().beneficiaryAdditionalDetail.create({
        data: {
          uniqueId: uniqueId(24),
          beneficiaryAccountId: beneficiaryAccount.id,
          addressType: cleanDbField(addDetail.address_type) ?? "PRESENT",
          addressLine1: cleanDbField(addDetail.address_line1),
          addressLine2: cleanDbField(addDetail.address_line2),
          postalCode: cleanDbField(addDetail.postal_code),
          city: cleanDbField(addDetail.city),
          state: cleanDbField(addDetail.state),
          country: cleanDbField(addDetail.country),
          paymentType: cleanDbField(addDetail.payment_type),
          bankAddressLine1: cleanDbField(addDetail.bank_address_line1),
          bankAddressLine2: cleanDbField(addDetail.bank_address_line2),
          bankPostalCode: cleanDbField(addDetail.bank_postal_code),
          bankCity: cleanDbField(addDetail.bank_city),
          bankState: cleanDbField(addDetail.bank_state),
          bankCountry: cleanDbField(addDetail.bank_country),
          purposeOfTransaction: cleanDbField(addDetail.purpose_of_transaction),
          userSourceOfIncome: cleanDbField(addDetail.user_source_of_income),
        },
      });
    }

    // 2. Sender (remitter) lookup / creation
    const senderIdNumber = remitterPayload.id_number ? String(remitterPayload.id_number).trim() : null;
    let senderRow = senderIdNumber
      ? await prisma().sender.findFirst({
          where: {
            userId: user.id,
            idNumber: senderIdNumber,
            deletedAt: null,
          },
        })
      : null;

    if (!senderRow) {
      let dobValue: Date | null = null;
      if (remitterPayload.dob) {
        const parsedDob = new Date(remitterPayload.dob as string);
        if (!isNaN(parsedDob.getTime())) {
          dobValue = parsedDob;
        }
      }

      senderRow = await prisma().sender.create({
        data: {
          uniqueId: uniqueId(24),
          userId: user.id,
          firstName: cleanDbField(remitterPayload.first_name),
          middleName: cleanDbField(remitterPayload.middle_name),
          lastName: cleanDbField(remitterPayload.last_name),
          email: cleanDbField(remitterPayload.email),
          mobileCountryCode: cleanDbField(remitterPayload.mobile_country_code),
          mobile: cleanDbField(remitterPayload.mobile),
          dob: dobValue,
          country: cleanDbField(remitterPayload.country),
          nationality: cleanDbField(remitterPayload.nationality),
          address1: cleanDbField(remitterPayload.address_1 ?? remitterPayload.address),
          address2: cleanDbField(remitterPayload.address_2),
          city: cleanDbField(remitterPayload.city),
          state: cleanDbField(remitterPayload.state),
          postalCode: cleanDbField(remitterPayload.postal_code),
          type: typeof remitterPayload.type === "number" ? remitterPayload.type : null,
          idType: cleanDbField(remitterPayload.id_type),
          idNumber: senderIdNumber,
          sourceOfFunds: cleanDbField(remitterPayload.source_of_funds),
          businessPersons: remitterPayload.business_persons ? (remitterPayload.business_persons as any) : null,
          status: 1,
        },
      });
    }

    // 3. Virtual account resolution
    const vaScope = await getVirtualAccountScope(user);
    const virtualAccount = await prisma().virtualAccount.findFirst({
      where: vaScope,
    });
    if (!virtualAccount) {
      throw new Error(`No virtual account found for user: ${user.id}`);
    }

    // 4. Quote generation & persist
    const quoteBody: QuoteStoreInput = {
      amount: Number(payoutJob.amount),
      recipient_type: "individual",
      recipient_country: beneficiaryAccount.country,
      receiving_currency: beneficiaryAccount.currency,
      quote_type: QUOTE_TYPE_REVERSE,
      payment_rail: beneficiaryAccount.paymentRail ?? undefined,
    };

    if (user.merchantId) {
      const bizModel = await getBusinessModel(user.merchantId);
      if (bizModel.toUpperCase() === BUSINESS_MODEL_DEAL_BASED) {
        const wallet = await prisma().wallet.findFirst({
          where: {
            userId: user.id,
            currency: beneficiaryAccount.currency.toUpperCase(),
          },
        });
        if (wallet) {
          quoteBody.wallet_id = wallet.uniqueId;
        }
      }
    }

    if (!quoteBody.wallet_id) {
      quoteBody.bank_account_id = virtualAccount.uniqueId;
    }

    const source = await resolveSource(quoteBody, user);
    const quoteResponse = await buildResponse(
      quoteBody,
      source,
      user.id,
      user.merchantId,
      merchant?.type ?? null,
      QUOTE_MODE_QUOTATION,
      1,
    );
    const quote = await persistQuote(user, quoteResponse);

    // 5. Creator Context (TeamMember) resolution
    let creatorContext: any = null;
    if (payload.creator) {
      const tm = await prisma().teamMember.findUnique({
        where: { id: BigInt(payload.creator) },
      });
      if (tm) {
        creatorContext = {
          id: tm.id,
          role: tm.role,
          permission: tm.permission,
          senderId: tm.senderId,
        };
      }
    }

    // 6. Create BeneficiaryTransaction
    const txnPayload = {
      beneficiary_account_id: beneficiaryAccount.uniqueId,
      quote_id: quote.uniqueId,
      remitter_id: senderRow.uniqueId,
      remarks: transactionPayloadData.remarks ?? undefined,
      txn_ref_no: transactionPayloadData.txn_ref_no ?? undefined,
      client_reference_id: remitterPayload.client_reference_id
        ? String(remitterPayload.client_reference_id)
        : undefined,
    };

    const transaction = await createPayoutTransaction(txnPayload, user, creatorContext);

    // 7. Update PayoutJob status
    await prisma().payoutJob.update({
      where: { id: payoutJob.id },
      data: {
        beneficiaryTransactionId: transaction.id,
        status: PAYOUT_JOB_STATUS_COMPLETED,
      },
    });

    reqLogger.info({ transactionId: transaction.id.toString() }, "Bulk payout processed successfully");
  } catch (error: any) {
    reqLogger.error({ error }, "Bulk payout job execution failed");
    await recordBulkPayoutFailure(payoutJobUniqueId, error.message || String(error));
    throw error;
  }
}

export async function recordBulkPayoutFailure(
  payoutJobUniqueId: string,
  errorMessage: string,
): Promise<void> {
  await prisma()
    .payoutJob.update({
      where: { uniqueId: payoutJobUniqueId },
      data: {
        status: PAYOUT_JOB_STATUS_FAILED,
        errorMessage: errorMessage.slice(0, 1024),
      },
    })
    .catch(() => undefined);
}
