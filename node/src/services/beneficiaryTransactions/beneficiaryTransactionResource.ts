import {
  BeneficiaryTransaction,
  BeneficiaryAccount,
  Sender,
  Quote,
  SenderDocument,
  BeneficiaryTransactionProof,
} from "@prisma/client";
import { prisma } from "../../db/prisma";
import { beneficiaryTransactionStatusLabel } from "../../helpers/constants";
import { formatDate, findValueByKeySync } from "../../helpers/lookups";
import { beneficiaryAccountResource, filterEmptyValues } from "../beneficiaryAccounts/beneficiaryResource";
import { s3Service } from "../storage/s3Service";

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryTransactionResource.
 * Field shape updated to match the exact JSON structure expected by the legacy system.
 */

export interface BeneficiaryTransactionDto {
  unique_id: string;
  txn_ref_no: string | null;
  utr_number: string | null;
  beneficiary_account: any;
  quote: any;
  amount: string;
  commission_amount: string;
  total_amount: string;
  sending_currency: string;
  recipient_amount: string;
  receiving_currency: string;
  remarks: string;
  notes: string;
  supporting_document: string;
  status: string;
  created_by: string;
  created_at: string;
  remitter?: any;
  client_reference_id?: string;
  purpose_of_payment?: string;
  transaction_proof?: any;
}

async function safeTemporaryUrl(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  try {
    return await s3Service.temporaryUrl(url);
  } catch (err) {
    return url;
  }
}

function remitterStatusLabel(status: number): string {
  switch (status) {
    case 0: return "PENDING";
    case 1: return "APPROVED";
    case 2: return "REJECTED";
    case 3: return "EXPIRED";
    case 4: return "DISABLED";
    default: return "";
  }
}

function transactionProofStatusLabel(status: number): string {
  switch (status) {
    case 1: return "REQUESTED";
    case 2: return "PROVIDED";
    case 3: return "REJECTED";
    default: return "";
  }
}

export async function beneficiaryTransactionResource(
  txn: BeneficiaryTransaction & {
    beneficiaryAccount?: (BeneficiaryAccount & { additionalDetails?: any }) | null;
    senders?: (Sender & { documents?: SenderDocument[] }) | null;
    quotes?: Quote | null;
    team_members?: { uniqueId: string } | null;
    users?: { timezone: string; uniqueId: string } | null;
    proofs?: BeneficiaryTransactionProof[] | null;
  },
  isTeam = false,
): Promise<BeneficiaryTransactionDto> {
  const userTimezone = txn.users?.timezone ?? "Asia/Kolkata";
  const statusLabel = beneficiaryTransactionStatusLabel(txn.status, isTeam);

  // Resolve source currency
  let sourceCurrency = "USD";
  if (txn.quotes && txn.quotes.sourceType && txn.quotes.sourceId) {
    const sType = txn.quotes.sourceType;
    const sId = txn.quotes.sourceId;
    try {
      if (sType.includes("Wallet")) {
        const wallet = await prisma().wallet.findFirst({
          where: { id: sId },
          select: { currency: true }
        });
        if (wallet?.currency) {
          sourceCurrency = wallet.currency;
        }
      } else if (sType.includes("VirtualAccount")) {
        const va = await prisma().virtualAccount.findFirst({
          where: { id: sId },
          select: { currency: true }
        });
        if (va?.currency) {
          sourceCurrency = va.currency;
        }
      }
    } catch (e) {
      // Ignored
    }
  } else if (txn.quotes?.receivingCurrency) {
    sourceCurrency = txn.quotes.receivingCurrency;
  }

  // Quote DTO
  let quoteDto = null;
  if (txn.quotes) {
    const recipientType = txn.quotes.recipientType === 2 ? "BUSINESS" : "PERSONAL";
    const effectiveSourceCurrency = sourceCurrency ?? txn.quotes.receivingCurrency ?? "USD";
    const fxRateString = txn.quotes.fxRate && txn.quotes.fxRate !== "1"
      ? `1 ${effectiveSourceCurrency} = ${txn.quotes.fxRate} ${txn.quotes.receivingCurrency}`
      : `1 ${effectiveSourceCurrency} = 1 ${effectiveSourceCurrency}`;

    quoteDto = {
      unique_id: txn.quotes.uniqueId,
      sending_amount: txn.quotes.amount.toFixed(2),
      receiving_amount: txn.quotes.receivingAmount.toFixed(2),
      fees: Number(txn.quotes.commissionAmount.add(txn.quotes.merchantCommissionAmount ?? 0).add(txn.quotes.externalCommissionAmount ?? 0)),
      total_amount: (txn.quotes.totalSendingAmount ?? txn.quotes.amount).toFixed(2),
      fx_rate: fxRateString,
      quote_type: txn.quotes.quoteType,
      recipient_type: recipientType,
      recipient_country: txn.quotes.recipientCountry ?? "",
      receiving_currency: txn.quotes.receivingCurrency ?? "",
      payment_rail: txn.quotes.paymentRail ?? "",
      expires_at: formatDate(txn.quotes.expiresAt, userTimezone),
    };
  }

  // Fallback to fetch user uniqueId if relationship is not preloaded
  let createdBy = "";
  if (txn.team_members?.uniqueId) {
    createdBy = txn.team_members.uniqueId;
  } else if (txn.users?.uniqueId) {
    createdBy = txn.users.uniqueId;
  } else if (txn.userId) {
    try {
      const u = await prisma().user.findUnique({
        where: { id: txn.userId },
        select: { uniqueId: true }
      });
      if (u?.uniqueId) {
        createdBy = u.uniqueId;
      }
    } catch (e) {
      // Ignored
    }
  }

  const dto: any = {
    unique_id: txn.uniqueId,
    txn_ref_no: txn.txnRefNo ?? "",
    utr_number: txn.externalReferenceId ?? "",
    beneficiary_account: txn.beneficiaryAccount
      ? await beneficiaryAccountResource(txn.beneficiaryAccount as any)
      : {},
    quote: quoteDto ?? {},
    amount: txn.amount.toFixed(2),
    commission_amount: txn.commissionAmount.toFixed(2),
    total_amount: txn.totalAmount.toFixed(2),
    sending_currency: sourceCurrency,
    recipient_amount: txn.recipientAmount.toFixed(2),
    receiving_currency: txn.receivingCurrency ?? "",
    remarks: txn.remarks ?? "",
    notes: txn.notes ?? "",
    supporting_document: txn.supportingDocument ? await safeTemporaryUrl(txn.supportingDocument) : "",
    status: statusLabel,
    created_by: createdBy,
    created_at: formatDate(txn.createdAt, userTimezone),
  };

  if (txn.senders) {
    const s = txn.senders;
    const isRemitterBusiness = Number(s.type) === 2;

    const remitterData: any = {
      unique_id: s.uniqueId,
      type: isRemitterBusiness ? "BUSINESS" : "PERSONAL",
      first_name: s.firstName ?? "",
      last_name: s.lastName ?? "",
      middle_name: s.middleName ?? "",
      email: s.email ?? "",
      mobile_country_code: s.mobileCountryCode ?? "",
      mobile: s.mobile ?? "",
      address: s.address1 ?? "",
      country: s.country ?? "",
      nationality: s.nationality ?? "",
      city: s.city ?? "",
      state: s.state ?? "",
      postal_code: s.postalCode ?? "",
      source_of_funds: s.sourceOfFunds ? findValueByKeySync(s.sourceOfFunds) : "",
      id_type: s.idType ? findValueByKeySync(s.idType) : "",
      id_number: s.idNumber ?? "",
      status: remitterStatusLabel(s.status),
      created_at: formatDate(s.createdAt, userTimezone),
    };

    if (s.clientReferenceId) {
      remitterData.client_reference_id = s.clientReferenceId;
    }
    if (s.dob) {
      const d = typeof s.dob === "string" ? new Date(s.dob) : s.dob;
      if (d instanceof Date && !isNaN(d.getTime())) {
        remitterData.dob = d.toISOString().split("T")[0];
      } else {
        remitterData.dob = String(s.dob);
      }
    }

    if (isRemitterBusiness) {
      const businessPersonsRaw = s.businessPersons as any[];
      const businessPersons = Array.isArray(businessPersonsRaw)
        ? businessPersonsRaw.map((person) => {
            const p = { ...person };
            if (p.id_type) {
              p.id_type = findValueByKeySync(p.id_type);
            }
            if (p.designation) {
              p.designation = findValueByKeySync(p.designation);
            }
            return p;
          })
        : [];

      remitterData.business_name = s.firstName ?? "";
      remitterData.business_persons = businessPersons;

      const docs = s.documents;
      const proofs = [];
      if (docs) {
        for (const doc of docs) {
          proofs.push({
            document_name: doc.documentName ?? "",
            document_type: doc.documentType ?? "",
            document_country: doc.documentCountry ?? "",
            document_file: doc.documentFile ? await safeTemporaryUrl(doc.documentFile) : "",
          });
        }
      }
      remitterData.proofs = proofs;

      delete remitterData.first_name;
      delete remitterData.last_name;
      delete remitterData.middle_name;
      delete remitterData.title;
    }

    dto.remitter = remitterData;
  }

  if (txn.clientReferenceId) {
    dto.client_reference_id = txn.clientReferenceId;
  }

  if (txn.purposeOfPayment) {
    dto.purpose_of_payment = findValueByKeySync(txn.purposeOfPayment);
  }

  if (txn.proofs && txn.proofs.length > 0) {
    const p = txn.proofs[0];
    if (p) {
      dto.transaction_proof = await transactionProofResource(
        { ...p, transaction: { uniqueId: txn.uniqueId } },
        userTimezone,
      );
    }
  }

  // Use the recursive filterEmptyValues helper to clean empty properties
  const filtered = filterEmptyValues(dto) ?? {};

  // Ensure remarks, supporting_document, and purpose_of_payment are explicitly
  // present as empty strings in the response if they are empty or omitted.
  if (filtered.remarks === undefined) {
    filtered.remarks = "";
  }
  if (filtered.supporting_document === undefined) {
    filtered.supporting_document = "";
  }
  if (filtered.purpose_of_payment === undefined) {
    filtered.purpose_of_payment = "";
  }

  return filtered;
}

/**
 * Mirror of App\\Http\\Resources\\BeneficiaryTransactionCallbackResource -
 * a slimmer view used by the /check_status endpoint.
 */
export function beneficiaryTransactionCallbackResource(
  txn: BeneficiaryTransaction,
): Record<string, unknown> {
  return {
    unique_id: txn.uniqueId ?? "",
    txn_ref_no: txn.txnRefNo ?? "",
    client_reference_id: txn.clientReferenceId ?? "",
    utr_number: txn.externalReferenceId ?? "",
    total_amount: txn.totalAmount ? txn.totalAmount.toString() : "",
    status: beneficiaryTransactionStatusLabel(txn.status) ?? "",
    remarks: txn.notes ?? "",
  };
}

/**
 * Mirror of TransactionProofResource.
 */
export interface TransactionProofDto {
  transaction_id: string;
  status: string;
  file: string;
  remitter_proof: string;
  requested_at: string;
}

export async function transactionProofResource(
  p: BeneficiaryTransactionProof & {
    transaction?: { uniqueId: string } | null;
  },
  timezone?: string,
): Promise<TransactionProofDto> {
  const tz = timezone || "Asia/Kolkata";
  return {
    transaction_id: p.transaction?.uniqueId ?? "",
    status: p.status ? transactionProofStatusLabel(p.status) : "",
    file: p.fileUrl ? await safeTemporaryUrl(p.fileUrl) : "",
    remitter_proof: p.remitterProof ? await safeTemporaryUrl(p.remitterProof) : "",
    requested_at: p.requestedAt ? formatDate(p.requestedAt, tz) : "",
  };
}
