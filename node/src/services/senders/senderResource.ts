import { Sender, SenderDocument } from "@prisma/client";
import { formatDate } from "../../helpers/lookups";

export interface SenderDto {
  unique_id: string;
  type: string | null;
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
  
  // Business fields
  business_name?: string | null;
  business_persons?: unknown;
  proofs?: SenderDocumentDto[];

  // Personal fields
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  dob?: string | null;
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
    email: sender.email,
    mobile_country_code: sender.mobileCountryCode,
    mobile: sender.mobile,
    address: sender.address1 || "",
    country: sender.country || "",
    nationality: sender.nationality || "",
    city: sender.city || "",
    state: sender.state || "",
    postal_code: sender.postalCode || "",
    source_of_funds: sender.sourceOfFunds || "",
    id_type: sender.idType || "",
    id_number: sender.idNumber || "",
    status: STATUS_MAP[sender.status] ?? "PENDING",
    // Ensure created_at is present
    created_at: formatDate(sender.createdAt || (sender as any).created_at),
  };

  if (isBusiness) {
    dto.business_name = sender.firstName || "";
    dto.business_persons = sender.businessPersons || [];
    dto.proofs = (sender.documents || []).map((d) => ({
      document_name: d.documentName,
      document_type: d.documentType,
      document_country: d.documentCountry || "",
      document_file: d.documentFile,
    }));
  } else {
    dto.first_name = sender.firstName || "";
    dto.last_name = sender.lastName || "";
    dto.middle_name = sender.middleName || "";
    dto.dob = sender.dob ? sender.dob.toISOString().slice(0, 10) : "";
  }

  return dto as SenderDto;
}
