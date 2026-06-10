import { Sender, SenderDocument } from "@prisma/client";
import { formatDate } from "../../helpers/lookups";
import { lookupsService } from "../lookups/lookupsService";
import { prisma } from "../../db/prisma";
import { LOOKUP_TYPE_ID_TYPE, LOOKUP_TYPE_PROFESSION } from "../../helpers/constants";

/**
 * Mirror of App\\Http\\Resources\\SenderResource.
 * Optimized to match the exact JSON structure expected by existing integrations.
 */

export interface SenderDto {
  unique_id: string;
  type: string | null;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  email: string | null;
  mobile_country_code: string | null;
  mobile: string | null;
  address: string | null;
  country: string | null;
  nationality: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  source_of_funds: string | null;
  id_type: string | null;
  id_number: string | null;
  status: string;
  created_at: string;
  dob?: string | null;
  
  // Business fields
  business_name?: string | null;
  business_persons?: any[];
  proofs?: SenderDocumentDto[];
}

export interface SenderDocumentDto {
  document_name: string | null;
  document_type: string | null;
  document_country: string | null;
  document_file: string | null;
}

const TYPE_MAP: Record<number, string> = {
  1: "PERSONAL",
  2: "BUSINESS",
};

const STATUS_MAP: Record<number, string> = {
  0: "PENDING",
  1: "APPROVED",
  2: "REJECTED",
  3: "EXPIRED",
  4: "DISABLED",
};

async function getStateName(
  stateCodeOrName: string | null | undefined,
  countryCode?: string | null,
): Promise<string> {
  if (!stateCodeOrName) return "";
  const trimmed = stateCodeOrName.trim();
  const stateRow = await prisma().state.findFirst({
    where: {
      OR: [
        { stateCode: { equals: trimmed } },
        { name: { equals: trimmed } },
      ],
      ...(countryCode
        ? {
            OR: [
              { countryCode: { equals: countryCode } },
              { countryAlpha3: { equals: countryCode } },
            ],
          }
        : {}),
    },
  });
  return stateRow ? stateRow.name : trimmed;
}

export async function senderResource(
  sender: Sender & { documents?: SenderDocument[] | null },
): Promise<SenderDto> {
  const isBusiness = sender.type === 2;
  
  // Base fields shared by both types
  const dto: any = {
    unique_id: sender.uniqueId,
    type: sender.type ? TYPE_MAP[sender.type] ?? "PERSONAL" : null,
  };

  const stateName = sender.state ? await getStateName(sender.state, sender.country) : "";
  const sourceOfFundsValue = sender.sourceOfFunds
    ? await lookupsService.findValuebyKey(sender.sourceOfFunds)
    : "";
  const idTypeValue = sender.idType
    ? await lookupsService.findValuebyKey(sender.idType, LOOKUP_TYPE_ID_TYPE)
    : "";

  if (isBusiness) {
    // Business specific layout
    Object.assign(dto, {
      email: sender.email,
      mobile_country_code: sender.mobileCountryCode,
      mobile: sender.mobile,
      address: [sender.address1, sender.address2].filter(Boolean).join(" "),
      country: sender.country || "",
      nationality: sender.nationality || "",
      city: sender.city || "",
      state: stateName,
      postal_code: sender.postalCode || "",
      source_of_funds: sourceOfFundsValue,
      id_type: idTypeValue,
      id_number: sender.idNumber || "",
      status: STATUS_MAP[sender.status] ?? "PENDING",
      created_at: formatDate(sender.createdAt),
      business_name: sender.firstName || "",
      business_persons: await Promise.all(
        (sender.businessPersons as any[] | null || []).map(async (p) => {
          const bpState = p.state ? await getStateName(p.state, p.country) : "";
          const bpIdType = p.id_type ? await lookupsService.findValuebyKey(p.id_type, LOOKUP_TYPE_ID_TYPE) : "";
          const bpDesignation = p.designation ? await lookupsService.findValuebyKey(p.designation, LOOKUP_TYPE_PROFESSION) : "";
          return {
            email: p.email || "",
            country: p.country || "",
            id_type: bpIdType,
            address_1: p.address_1 || "",
            id_number: p.id_number || "",
            last_name: p.last_name || "",
            first_name: p.first_name || "",
            designation: bpDesignation,
            nationality: p.nationality || "",
            state: bpState,
            mobile: p.mobile || "",
            mobile_country_code: p.mobile_country_code || "",
            address_2: p.address_2 || "",
            postal_code: p.postal_code || "",
            city: p.city || "",
            ...(p.dob ? { dob: p.dob } : {}),
          };
        })
      ),
      proofs: await Promise.all(
        (sender.documents || []).map(async (d) => {
          let signedFile = d.documentFile || "";
          if (d.documentFile) {
            try {
              const { s3Service } = await import("../../services/storage/s3Service");
              signedFile = await s3Service.temporaryUrl(d.documentFile);
            } catch {
              // Ignore and use raw URL on failure
            }
          }
          return {
            document_name: d.documentName,
            document_type: d.documentType,
            document_country: d.documentCountry || "",
            document_file: signedFile,
          };
        }),
      ),
    });
  } else {
    // Individual specific layout
    Object.assign(dto, {
      first_name: sender.firstName || "",
      last_name: sender.lastName || "",
      middle_name: sender.middleName || "",
      email: sender.email,
      mobile_country_code: sender.mobileCountryCode,
      mobile: sender.mobile,
      address: [sender.address1, sender.address2].filter(Boolean).join(" "),
      country: sender.country || "",
      nationality: sender.nationality || "",
      city: sender.city || "",
      state: stateName,
      postal_code: sender.postalCode || "",
      source_of_funds: sourceOfFundsValue,
      id_type: idTypeValue,
      id_number: sender.idNumber || "",
      status: STATUS_MAP[sender.status] ?? "PENDING",
      created_at: formatDate(sender.createdAt),
      dob: sender.dob ? sender.dob.toISOString().slice(0, 10) : "",
    });
  }

  return dto as SenderDto;
}
