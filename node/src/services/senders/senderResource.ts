import { Sender, SenderDocument } from "@prisma/client";

export interface SenderDto {
  unique_id: string;
  client_reference_id: string | null;
  type: number | null;
  title: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_country_code: string | null;
  mobile: string | null;
  dob: string | null;
  country: string | null;
  nationality: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  id_type: string | null;
  id_number: string | null;
  source_of_funds: string | null;
  business_persons: unknown;
  status: number;
  created_at: string;
  documents?: SenderDocumentDto[];
}

export interface SenderDocumentDto {
  unique_id: string;
  document_name: string | null;
  document_type: string | null;
  document_country: string | null;
  document_file: string | null;
  status: number;
}

export function senderResource(
  sender: Sender & { documents?: SenderDocument[] | null },
): SenderDto {
  const dto: SenderDto = {
    unique_id: sender.uniqueId,
    client_reference_id: sender.clientReferenceId,
    type: sender.type,
    title: sender.title,
    first_name: sender.firstName,
    middle_name: sender.middleName,
    last_name: sender.lastName,
    email: sender.email,
    mobile_country_code: sender.mobileCountryCode,
    mobile: sender.mobile,
    dob: sender.dob ? sender.dob.toISOString().slice(0, 10) : null,
    country: sender.country,
    nationality: sender.nationality,
    address_1: sender.address1,
    address_2: sender.address2,
    city: sender.city,
    state: sender.state,
    postal_code: sender.postalCode,
    id_type: sender.idType,
    id_number: sender.idNumber,
    source_of_funds: sender.sourceOfFunds,
    business_persons: sender.businessPersons,
    status: sender.status,
    created_at: sender.createdAt ? sender.createdAt.toISOString() : "",
  };
  if (sender.documents) {
    dto.documents = sender.documents.map((d) => ({
      unique_id: d.uniqueId,
      document_name: d.documentName,
      document_type: d.documentType,
      document_country: d.documentCountry,
      document_file: d.documentFile,
      status: d.status,
    }));
  }
  return dto;
}
