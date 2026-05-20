import { Sender, SenderDocument } from "@prisma/client";
import { formatDate } from "../../helpers/lookups";

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

export function senderResource(
  sender: Sender & { documents?: SenderDocument[] | null },
): SenderDto {
  const isBusiness = sender.type === 2;
  
  // Base fields shared by both types
  const dto: any = {
    unique_id: sender.uniqueId,
    type: sender.type ? TYPE_MAP[sender.type] ?? "PERSONAL" : null,
  };

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
      state: sender.state || "",
      postal_code: sender.postalCode || "",
      source_of_funds: sender.sourceOfFunds || "",
      id_type: sender.idType || "",
      id_number: sender.idNumber || "",
      status: STATUS_MAP[sender.status] ?? "PENDING",
      created_at: formatDate(sender.createdAt),
      business_name: sender.firstName || "",
      business_persons: (sender.businessPersons as any[] | null || []).map(p => ({
        email: p.email || "",
        country: p.country || "",
        id_type: p.id_type || "",
        address_1: p.address_1 || "",
        id_number: p.id_number || "",
        last_name: p.last_name || "",
        first_name: p.first_name || "",
        designation: p.designation || "",
        nationality: p.nationality || ""
      })),
      proofs: (sender.documents || []).map((d) => ({
        document_name: d.documentName,
        document_type: d.documentType,
        document_country: d.documentCountry || "",
        document_file: d.documentFile,
      }))
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
      state: sender.state || "",
      postal_code: sender.postalCode || "",
      source_of_funds: sender.sourceOfFunds || "",
      id_type: sender.idType || "",
      id_number: sender.idNumber || "",
      status: STATUS_MAP[sender.status] ?? "PENDING",
      created_at: formatDate(sender.createdAt),
      dob: sender.dob ? sender.dob.toISOString().slice(0, 10) : "",
    });
  }

  return dto as SenderDto;
}
