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
import { format_processing_unit_fx_rate } from "../../helpers/lookups";
import { lookupsService } from "../lookups/lookupsService";

/**
 * Shared payload builder for ProcessingUnit + Compliance.
 *
 * Mirror of App\\ExternalServices\\ProcessingUnit\\ProcessingUnit::preparePayload.
 * Both providers accept the same shape in production; keeping the builder
 * here avoids drift between the two drivers.
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
// @ts-ignore - Catch-all auto-fix for: Type 'T' is generic and can on...
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
  documentFile: string | null;
  documentType: string | null;
  documentCountry: string | null;
}

async function loadRelated(
  txn: BeneficiaryTransaction,
  user: User,
): Promise<RelatedRows | null> {
  const [account, additional, sender, senderDocument, quote, userInformation, userDocument] = await Promise.all([
    txn.beneficiaryAccountId
      ? prisma().beneficiaryAccount.findUnique({
          where: { id: txn.beneficiaryAccountId },
        })
      : Promise.resolve(null),
    txn.beneficiaryAccountId
      ? prisma().beneficiaryAdditionalDetail.findFirst({ where: { beneficiaryAccountId: txn.beneficiaryAccountId },
        })
      : Promise.resolve(null),
    txn.senderId
      ? prisma().sender.findUnique({ where: { id: txn.senderId } })
      : Promise.resolve(null),
    txn.senderId
      ? prisma().senderDocument.findFirst({ where: { senderId: txn.senderId } })
      : Promise.resolve(null),
    txn.quoteId
      ? prisma().quote.findUnique({ where: { id: txn.quoteId } })
      : Promise.resolve(null),
    prisma().userInformation.findFirst({ where: { userId: user.id } }),
    txn.senderId
      ? Promise.resolve(null)
      : prisma().userDocument.findFirst({ where: { userId: user.id } }),
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
    const merchant = await prisma().merchant.findUnique({
      where: { id: user.merchantId },
    });
    if (merchant?.type === MERCHANT_TYPE_PAYOUT) {
      const setting = await prisma().merchantSetting.findFirst({ where: { merchantId: merchant.id, key: "caliza_account_id"  },
      });
      if (setting?.value) {
        externalReferenceId = setting.value;
      } else {
        const va = await prisma().virtualAccount.findFirst({
            where: { userId: user.id }
        });
        if (va) {
            externalReferenceId = va.externalReferenceId;
        }
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

  let documentFile = sender ? senderDocument?.documentFile : userDocument?.documentFile;
  if (!documentFile || documentFile.trim() === "") {
    documentFile = txn.supportingDocument;
  }
  const documentType = sender ? senderDocument?.documentType : userDocument?.documentType;
  const documentCountry = sender ? senderDocument?.documentCountry : userDocument?.documentCountry;

  return {
    account,
    additional,
    sender,
    quote,
    userInformation,
    sourceCurrency,
    externalReferenceId,
    documentFile: documentFile ?? null,
    documentType: documentType ?? null,
    documentCountry: documentCountry ?? null,
  };
}

async function remitterFromUser(
  user: User,
  userInformation: UserInformation | null,
  docFile: string | null,
  docType: string | null,
  docCountry: string | null,
): Promise<Record<string, unknown>> {
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
      id_type: await lookupsService.findValuebyKey(userInformation?.idType, "id_types"),
      id_number: userInformation?.idNumber,
      source_of_funds: userInformation?.sourceOfIncome,
      document_file: docFile,
      document_type: docType ? await lookupsService.findValuebyKey(docType, "document_types") : (docFile ? "Other" : null),
      document_country: docCountry,
    };
  }

  const remitter: Record<string, unknown> = {
    type: "BUSINESS",
    business_name: userInformation?.businessName,
    type_of_business: await lookupsService.findValuebyKey(
      userInformation?.type_of_business,
      "business_types",
    ) || "Company",
    email: user.email,
    mobile_country_code: user.mobileCountryCode,
    mobile: user.mobile,
    address_1: userInformation?.address1,
    address_2: userInformation?.address2,
    city: userInformation?.city,
    state: userInformation?.state,
    postal_code: userInformation?.postalCode,
    id_type: await lookupsService.findValuebyKey(userInformation?.idType, "id_types"),
    id_number: userInformation?.idNumber,
    source_of_funds: userInformation?.sourceOfIncome,
    country: userInformation?.country,
    document_file: docFile,
    document_type: docType ? await lookupsService.findValuebyKey(docType, "document_types") : (docFile ? "Other" : null),
    document_country: docCountry,
  };

  if (userInformation?.businessPersons) {
    let persons: any[] = [];
    try {
      persons = typeof userInformation.businessPersons === "string" 
        ? JSON.parse(userInformation.businessPersons) 
        : userInformation.businessPersons as any[];
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
          id_type: await lookupsService.findValuebyKey(person.id_type, "id_types"),
          id_number: person.id_number ?? null,
          designation: person.designation_id
            ? await lookupsService.findValuebyKey(person.designation_id, "professions")
            : null,
        })),
      );
    }
  }

  return remitter;
}

async function remitterFromSender(
  sender: Sender,
  user: User,
  userInformation: UserInformation | null,
  docFile: string | null,
  docType: string | null,
  docCountry: string | null,
): Promise<Record<string, unknown>> {
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
      id_type: await lookupsService.findValuebyKey(sender.idType, "id_types"),
      id_number: sender.idNumber,
      source_of_funds: sender.sourceOfFunds,
      document_file: docFile,
      document_type: docType ? await lookupsService.findValuebyKey(docType, "document_types") : (docFile ? "Other" : null),
      document_country: docCountry,
    };
  }

  const remitter: Record<string, unknown> = {
    type: "BUSINESS",
    business_name: sender.firstName,
    type_of_business: await lookupsService.findValuebyKey(
      userInformation?.type_of_business,
      "business_types",
    ) || "Company",
    email: sender.email,
    mobile_country_code: sender.mobileCountryCode,
    mobile: sender.mobile,
    address_1: sender.address1,
    address_2: sender.address2,
    city: sender.city,
    state: sender.state,
    postal_code: sender.postalCode,
    id_type: await lookupsService.findValuebyKey(sender.idType, "id_types"),
    id_number: sender.idNumber,
    source_of_funds: sender.sourceOfFunds,
    country: sender.country,
    document_file: docFile,
    document_type: docType ? await lookupsService.findValuebyKey(docType, "document_types") : (docFile ? "Other" : null),
    document_country: docCountry,
  };

  if (sender.businessPersons) {
    let persons: any[] = [];
    try {
      persons = typeof sender.businessPersons === "string" 
        ? JSON.parse(sender.businessPersons) 
        : sender.businessPersons as any[];
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
          id_type: await lookupsService.findValuebyKey(person.id_type, "id_types"),
          id_number: person.id_number ?? null,
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
    mobile_country_code: account.mobileCountryCode ?? user.mobileCountryCode,
    mobile: account.mobile ?? user.mobile,
  };

  const remitter = sender
    ? await remitterFromSender(sender, user, userInformation, related.documentFile, related.documentType, related.documentCountry)
    : await remitterFromUser(user, userInformation, related.documentFile, related.documentType, related.documentCountry);

  const merchantName = user.merchantId
    ? (await prisma().merchant.findUnique({ where: { id: user.merchantId } }))?.name ?? user.firstName ?? user.email
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
  return removeEmpty(payload as Record<string, unknown>);
}
