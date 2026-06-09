import {
  BeneficiaryAccount,
  BeneficiaryAdditionalDetail,
  BeneficiaryTransaction,
  Quote,
  Sender,
  User,
  UserInformation,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  EXTERNAL_TYPE_CALIZA,
  MERCHANT_TYPE_PAYOUT,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import { format_processing_unit_fx_rate } from "../../helpers/lookups";
import { lookupsService } from "../lookups/lookupsService";
import { logger } from "../../helpers/logger";

/**
 * Shared payload builder for ProcessingUnit + Compliance.
 *
 * Mirror of App\\ExternalServices\\ProcessingUnit\\ProcessingUnit::preparePayload.
 */

/**
 * Mirror of Laravel's removeEmptyValues — strips null, undefined.
 * Note: Empty strings ("") ARE ALLOWED to satisfy mandatory API fields.
 */
function removeEmpty<T extends Record<string, unknown>>(obj: T): T {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      delete obj[k];
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v)) {
      const cleaned = removeEmpty(v as Record<string, unknown>);
      if (Object.keys(cleaned).length === 0) delete obj[k];
      // @ts-ignore
      else obj[k] = cleaned as never;
    }
  }
  return obj;
}

interface RelatedRows {
  account: BeneficiaryAccount;
  additional: BeneficiaryAdditionalDetail | null;
  sender: Sender | null;
  quote: Quote;
  userInformation: UserInformation | null;
  sourceCurrency: string;
  externalReferenceId: string | null;
}

async function loadRelated(
  txn: BeneficiaryTransaction,
  user: User,
): Promise<RelatedRows | null> {
  const [account, additional, sender, quote, userInformation] = await Promise.all([
    txn.beneficiaryAccountId
      ? prisma().beneficiaryAccount.findUnique({ where: { id: txn.beneficiaryAccountId } })
      : Promise.resolve(null),
    txn.beneficiaryAccountId
      ? prisma().beneficiaryAdditionalDetail.findFirst({ where: { beneficiaryAccountId: txn.beneficiaryAccountId } })
      : Promise.resolve(null),
    txn.senderId
      ? prisma().sender.findUnique({ where: { id: txn.senderId } })
      : Promise.resolve(null),
    txn.quoteId
      ? prisma().quote.findUnique({ where: { id: txn.quoteId } })
      : Promise.resolve(null),
    prisma().userInformation.findFirst({ where: { userId: user.id } }),
  ]);

  if (!account || !quote) return null;

  // Resolve source currency
  let sourceCurrency = "";
  const walletTxn = await prisma().walletTransaction.findFirst({
    where: { beneficiaryTransactionId: txn.id },
  });

  if (walletTxn) {
    // If the transaction is present in wallet_transactions table, fetch the wallet currency with the quote id
    const quoteId = walletTxn.quoteId;
    if (quoteId) {
      const q = quoteId === quote.id ? quote : await prisma().quote.findUnique({ where: { id: quoteId } });
      if (q && q.sourceId) {
        const wallet = await prisma().wallet.findUnique({ where: { id: q.sourceId } });
        sourceCurrency = wallet?.currency ?? "";
      }
    }
  } else {
    // Otherwise, check for the beneficiary transaction and fetch from the virtual accounts table with the quote id
    const quoteId = txn.quoteId;
    if (quoteId) {
      const q = quoteId === quote.id ? quote : await prisma().quote.findUnique({ where: { id: quoteId } });
      if (q && q.sourceId) {
        const va = await prisma().virtualAccount.findUnique({ where: { id: q.sourceId } });
        sourceCurrency = va?.currency ?? "";
      }
    }
  }

  // Resolve externalReferenceId (mirrors Laravel's merchant/userservice logic)
  let externalReferenceId: string | null = null;
  if (user.merchantId) {
    const merchant = await prisma().merchant.findUnique({ where: { id: user.merchantId } });
    if (merchant?.type === MERCHANT_TYPE_PAYOUT) {
      const setting = await prisma().merchantSetting.findFirst({
        where: { merchantId: merchant.id, key: "caliza_account_id" },
      });
      if (setting?.value) {
        externalReferenceId = setting.value;
      } else {
        const va = await prisma().virtualAccount.findFirst({ where: { userId: user.id } });
        if (va) externalReferenceId = va.externalReferenceId;
      }
    }
  }
  if (!externalReferenceId) {
    const us = await prisma().userService.findFirst({
      where: { userId: user.id, serviceType: EXTERNAL_TYPE_CALIZA, isActive: 1 },
      select: { externalReferenceId: true },
    });
    externalReferenceId = us?.externalReferenceId ?? null;
  }

  return { account, additional, sender, quote, userInformation, sourceCurrency, externalReferenceId };
}

/**
 * Builds the remitter object when there is NO sender (user is the remitter).
 *
 * Mirrors Laravel lines 221–300:
 *   - INDIVIDUAL: no document fields
 *   - BUSINESS: fetches UserDocument, includes document_file/document_type
 */
async function remitterFromUser(
  user: User,
  userInformation: UserInformation | null,
): Promise<Record<string, unknown>> {
  const sourceFunds = (userInformation?.sourceOfIncome) || "Other";

  // Mirror: if ($user->user_type == USER_TYPE_INDIVIDUAL)
  if (Number(user.userType) === USER_TYPE_INDIVIDUAL) {
    return {
      type: "INDIVIDUAL",
      first_name: user.firstName,
      last_name: user.lastName ?? user.firstName,
      country: userInformation?.country,
      email: user.email,
      mobile_country_code: user.mobileCountryCode,
      mobile: user.mobile,
      dob: user.dob,
      nationality: userInformation?.country,
      address_1: userInformation?.address1,
      address_2: userInformation?.address2,
      city: userInformation?.city,
      state: userInformation?.state,
      postal_code: userInformation?.postalCode,
      id_type: (await lookupsService.findValuebyKey(userInformation?.idType, "id_types")) || "Other",
      id_number: userInformation?.idNumber || "0000",
      source_of_funds: sourceFunds,
    };
  }

  // BUSINESS: Mirror: $sender_documents = UserDocument::where('user_id', $user->id)->first();
  const userDocument = await prisma().userDocument.findFirst({ where: { userId: user.id } });

  const remitter: Record<string, unknown> = {
    // Mirror: $user->type == USER_TYPE_INDIVIDUAL ? 'INDIVIDUAL' : 'BUSINESS'
    type: Number(user.userType) === USER_TYPE_INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS",
    business_name: userInformation?.businessName,
    type_of_business:
      (await lookupsService.findValuebyKey(userInformation?.type_of_business, "business_types")) ||
      "Company",
    document_file: userDocument?.documentFile ?? null,
    document_type: userDocument?.documentType
      ? (await lookupsService.findValuebyKey(userDocument.documentType, "document_types")) || "Other"
      : (userDocument?.documentFile ? "Other" : null),
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    address_1: userInformation?.address1,
    address_2: userInformation?.address2,
    city: userInformation?.city,
    state: userInformation?.state,
    postal_code: userInformation?.postalCode,
    id_type: (await lookupsService.findValuebyKey(userInformation?.idType, "id_types")) || "Other",
    id_number: userInformation?.idNumber || "0000",
    source_of_funds: sourceFunds,
    country: userInformation?.country,
  };

  // Mirror: if (!empty($user->userInformation->business_persons))
  if (userInformation?.businessPersons) {
    let persons: any[] = [];
    try {
      persons =
        typeof userInformation.businessPersons === "string"
          ? JSON.parse(userInformation.businessPersons)
          : (userInformation.businessPersons as any[]);
    } catch {
      persons = [];
    }

    if (Array.isArray(persons) && persons.length > 0) {
      const hasUbo = persons.some((p: any) => Number(p.designation_id) === 5);
      if (!hasUbo && persons[0]) {
        persons[0].designation_id = 5;
      }
      remitter.business_persons = await Promise.all(
        persons.map(async (person: any) => ({
          first_name: person.first_name ?? null,
          last_name: person.last_name ?? null,
          mobile_country_code: person.mobile_country_code ?? null,
          mobile: person.mobile ?? null,
          country: person.country ?? null,
          id_type: person.id_type
            ? (await lookupsService.findValuebyKey(person.id_type, "id_types")) || "Other"
            : "Other",
          id_number: person.id_number || "0000",
          designation: person.designation_id
            ? await lookupsService.findValuebyKey(person.designation_id, "professions")
            : null,
        })),
      );
    }
  }

  logger.info({ userId: user.id.toString(), remitter }, "[PU_DEBUG] remitterFromUser - Final object");
  return remitter;
}

/**
 * Builds the remitter object when a sender IS present.
 *
 * Mirrors Laravel lines 302–382:
 *   - INDIVIDUAL sender: no document fields
 *   - BUSINESS sender: fetches SenderDocument, includes document_file/document_type
 */
async function remitterFromSender(
  sender: Sender,
  user: User,
  userInformation: UserInformation | null,
): Promise<Record<string, unknown>> {
  const sourceFunds = sender.sourceOfFunds || "Other";

  // Mirror: if ($sender->type == USER_TYPE_INDIVIDUAL)
  if (Number(sender.type) === USER_TYPE_INDIVIDUAL) {
    return {
      type: "INDIVIDUAL",
      title: sender.title,
      first_name: sender.firstName,
      last_name: sender.lastName ?? sender.firstName,
      country: sender.country,
      email: sender.email ?? user.email,
      mobile_country_code: sender.mobileCountryCode ?? user.mobileCountryCode,
      mobile: sender.mobile ?? user.mobile,
      dob: sender.dob,
      nationality: sender.nationality ?? sender.country,
      address_1: sender.address1,
      address_2: sender.address2,
      city: sender.city ?? userInformation?.city,
      state: sender.state,
      postal_code: sender.postalCode,
      id_type: (await lookupsService.findValuebyKey(sender.idType, "id_types")) || "Other",
      id_number: sender.idNumber || "0000",
      source_of_funds: sourceFunds,
    };
  }

  // BUSINESS: Mirror: $sender_documents = SenderDocument::where('sender_id', $sender->id)->first();
  const senderDocument = await prisma().senderDocument.findFirst({ where: { senderId: sender.id } });

  const remitter: Record<string, unknown> = {
    type: "BUSINESS",
    business_name: sender.firstName,
    type_of_business:
      (await lookupsService.findValuebyKey(userInformation?.type_of_business, "business_types")) ||
      "Company",
    document_file: senderDocument?.documentFile ?? null,
    document_type: senderDocument?.documentType
      ? (await lookupsService.findValuebyKey(senderDocument.documentType, "document_types")) || "Other"
      : (senderDocument?.documentFile ? "Other" : null),
    email: sender.email,
    mobile_country_code: sender.mobileCountryCode,
    mobile: sender.mobile,
    address_1: sender.address1,
    address_2: sender.address2,
    city: sender.city,
    state: sender.state,
    postal_code: sender.postalCode,
    id_type: (await lookupsService.findValuebyKey(sender.idType, "id_types")) || "Other",
    id_number: sender.idNumber || "0000",
    source_of_funds: sourceFunds,
    country: sender.country,
  };

  // Mirror: if (!empty($sender->business_persons))
  if (sender.businessPersons) {
    let persons: any[] = [];
    try {
      persons =
        typeof sender.businessPersons === "string"
          ? JSON.parse(sender.businessPersons)
          : (sender.businessPersons as any[]);
    } catch {
      persons = [];
    }

    if (Array.isArray(persons) && persons.length > 0) {
      const hasUbo = persons.some((p: any) => Number(p.designation_id) === 5);
      if (!hasUbo && persons[0]) {
        persons[0].designation_id = 5;
      }
      remitter.business_persons = await Promise.all(
        persons.map(async (person: any) => ({
          first_name: person.first_name ?? null,
          last_name: person.last_name ?? null,
          mobile_country_code: person.mobile_country_code ?? null,
          mobile: person.mobile ?? null,
          country: person.country ?? null,
          id_type: person.id_type
            ? (await lookupsService.findValuebyKey(person.id_type, "id_types")) || "Other"
            : "Other",
          id_number: person.id_number || "0000",
          designation: person.designation_id
            ? await lookupsService.findValuebyKey(person.designation_id, "professions")
            : null,
        })),
      );
    }
  }

  return remitter;
}

export async function buildPayoutPayload(
  txn: BeneficiaryTransaction,
  user: User,
): Promise<Record<string, unknown> | null> {
  const related = await loadRelated(txn, user);
  if (!related) return null;

  const { account, additional, sender, quote, userInformation, sourceCurrency, externalReferenceId } = related;

  const common = {
    order_id: txn.orderId,
    from_amount: txn.amount,
    from_currency: sourceCurrency,
    amount: txn.recipientAmount,
    exchange_rate: format_processing_unit_fx_rate(quote.fxRate),
    receiving_currency: txn.receivingCurrency,
    side: quote.quoteType,
    remarks: txn.remarks,
    supporting_document: txn.supportingDocument,
    purpose_of_payment: additional?.purposeOfTransaction ?? null,
    rail: (account.paymentRail ?? "").toUpperCase(),
  };

  let beneficiaryMobileCountryCode = account.mobileCountryCode || user.mobileCountryCode;
  let beneficiaryMobile = account.mobile || user.mobile;

  if (account.currency === "INR") {
    beneficiaryMobileCountryCode = account.mobileCountryCode || "91";
    beneficiaryMobile = account.mobile || user.mobile;

    if (beneficiaryMobile) {
      beneficiaryMobile = beneficiaryMobile.replace(/\D/g, "");
      if (beneficiaryMobile.length > 10) {
        beneficiaryMobile = beneficiaryMobile.substring(0, 10);
      }
      if (beneficiaryMobile.length < 10) {
        beneficiaryMobile = beneficiaryMobile.padEnd(10, "0");
      }
    }
  }

  const beneficiary = {
    type: Number(account.type) === USER_TYPE_INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS",
    first_name: account.firstName,
    last_name: account.lastName ?? account.firstName,
    business_name: account.businessName,
    address_1: additional?.addressLine1 ?? null,
    address_2: additional?.addressLine2 ?? null,
    city: additional?.city ?? userInformation?.city ?? null,
    state: additional?.state ?? null,
    postal_code: additional?.postalCode ?? null,
    country: additional?.country ?? null,
    currency: account.currency,
    bank_name: account.bankName ?? account.swiftCode,
    account_name: account.accountName,
    account_number: account.accountNumber,
    iban: account.accountNumber,
    account_type: account.accountType ?? "Checking",
    routing_number: account.routingNumber,
    swift_code: account.swiftCode,
    ifsc_code: account.swiftCode,
    iso_code: account.swiftCode,
    email: account.email ?? user.email,
    mobile_country_code: beneficiaryMobileCountryCode,
    mobile: beneficiaryMobile,
  };

  const remitter = sender
    ? await remitterFromSender(sender, user, userInformation)
    : await remitterFromUser(user, userInformation);

  // Mirror: $txn->user->merchant ? $txn->user->merchant->name : $txn->user->name
  const merchantName = user.merchantId
    ? (await prisma().merchant.findUnique({ where: { id: user.merchantId } }))?.name ??
      user.firstName ??
      user.email
    : user.firstName ?? user.email;

  const payload = {
    ...common,
    beneficiary,
    remitter,
    merchant: {
      name: merchantName,
      email: user.email,
    },
    meta_data: {
      user_reference_id: externalReferenceId,
      beneficiary_reference_id: account.externalReferenceId,
      search_reference_id: txn.clientReferenceId ?? txn.txnRefNo,
    },
  };

  const finalPayload = removeEmpty(payload as Record<string, unknown>);
  logger.info({ orderId: txn.orderId, payload: finalPayload }, "[PU_DEBUG] Final Payout Payload");
  return finalPayload;
}
