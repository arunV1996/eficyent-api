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
  MORPH_VIRTUAL_ACCOUNT,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";

/**
 * Shared payload builder for ProcessingUnit + Compliance.
 *
 * Mirror of App\\ExternalServices\\ProcessingUnit\\ProcessingUnit::preparePayload.
 * Both providers accept the same shape in production; keeping the builder
 * here avoids drift between the two drivers.
 */

function removeEmpty<T extends Record<string, unknown>>(obj: T): T {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") {
      delete obj[k];
      continue;
    }
    if (typeof v === "object" && !Array.isArray(v)) {
      const cleaned = removeEmpty(v as Record<string, unknown>);
      if (Object.keys(cleaned).length === 0) delete obj[k];
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
      ? prisma().beneficiaryAccount.findUnique({
          where: { id: txn.beneficiaryAccountId },
        })
      : Promise.resolve(null),
    txn.beneficiaryAccountId
      ? prisma().beneficiaryAdditionalDetail.findUnique({
          where: { beneficiaryAccountId: txn.beneficiaryAccountId },
        })
      : Promise.resolve(null),
    txn.senderId
      ? prisma().sender.findUnique({ where: { id: txn.senderId } })
      : Promise.resolve(null),
    txn.quoteId
      ? prisma().quote.findUnique({ where: { id: txn.quoteId } })
      : Promise.resolve(null),
    prisma().userInformation.findUnique({ where: { userId: user.id } }),
  ]);
  if (!account || !quote) return null;

  let sourceCurrency = "";
  if (quote.sourceType === MORPH_VIRTUAL_ACCOUNT && quote.sourceId) {
    const va = await prisma().virtualAccount.findUnique({
      where: { id: quote.sourceId },
    });
    sourceCurrency = va?.currency ?? "";
  }

  let externalReferenceId: string | null = null;
  if (user.merchantId) {
    const merchant = await prisma().merchant.findFirst({
      where: { uniqueId: user.merchantId },
    });
    if (merchant?.type === MERCHANT_TYPE_PAYOUT) {
      const setting = await prisma().merchantSetting.findUnique({
        where: { merchantId_key: { merchantId: merchant.id, key: "caliza_account_id" } },
      });
      if (setting?.value) externalReferenceId = setting.value;
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

function remitterFromUser(
  user: User,
  userInformation: UserInformation | null,
): Record<string, unknown> {
  if (user.userType === USER_TYPE_INDIVIDUAL) {
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
      id_type: userInformation?.idType,
      id_number: userInformation?.idNumber,
      source_of_funds: userInformation?.sourceOfIncome,
    };
  }
  return {
    type: "BUSINESS",
    business_name: userInformation?.businessName,
    type_of_business: "Company",
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    address_1: userInformation?.address1,
    address_2: userInformation?.address2,
    city: userInformation?.city,
    state: userInformation?.state,
    postal_code: userInformation?.postalCode,
    id_type: userInformation?.idType,
    id_number: userInformation?.idNumber,
    source_of_funds: userInformation?.sourceOfIncome,
    country: userInformation?.country,
  };
}

function remitterFromSender(
  sender: Sender,
  user: User,
  userInformation: UserInformation | null,
): Record<string, unknown> {
  if (sender.type === USER_TYPE_INDIVIDUAL) {
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
      id_type: sender.idType,
      id_number: sender.idNumber,
      source_of_funds: sender.sourceOfFunds,
    };
  }
  return {
    type: "BUSINESS",
    business_name: sender.firstName,
    type_of_business: "Company",
    email: sender.email,
    mobile_country_code: sender.mobileCountryCode,
    mobile: sender.mobile,
    address_1: sender.address1,
    address_2: sender.address2,
    city: sender.city,
    state: sender.state,
    postal_code: sender.postalCode,
    id_type: sender.idType,
    id_number: sender.idNumber,
    source_of_funds: sender.sourceOfFunds,
    country: sender.country,
  };
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
    from_amount: txn.amount.toString(),
    from_currency: sourceCurrency,
    amount: txn.recipientAmount?.toString() ?? null,
    exchange_rate: quote.fxRate,
    receiving_currency: txn.receivingCurrency,
    side: quote.quoteType,
    remarks: txn.remarks,
    supporting_document: txn.supportingDocument,
    purpose_of_payment: additional?.purposeOfTransaction ?? null,
    rail: (account.paymentRail ?? "").toUpperCase(),
  };

  const beneficiary = {
    type: account.type === USER_TYPE_INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS",
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
    mobile_country_code: account.mobileCountryCode ?? user.mobileCountryCode,
    mobile: account.mobile ?? user.mobile,
  };

  const remitter = sender
    ? remitterFromSender(sender, user, userInformation)
    : remitterFromUser(user, userInformation);

  const payload = {
    ...common,
    beneficiary,
    remitter,
    merchant: {
      name: user.firstName ?? user.email,
      email: user.email,
    },
    meta_data: {
      user_reference_id: externalReferenceId,
      beneficiary_reference_id: account.externalReferenceId,
      search_reference_id: txn.clientReferenceId ?? txn.txnRefNo,
    },
  };
  return removeEmpty(payload as Record<string, unknown>);
}
