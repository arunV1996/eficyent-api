import { VirtualAccount } from "@prisma/client";

/**
 * Mirror of App\\Http\\Resources\\VirtualAccountResource. Field set + key
 * naming preserved as-is so the frontend sees no change. The `swift` child
 * is populated when the controller groups multi-rail accounts (e.g. ACH +
 * SWIFT pair) under one envelope.
 */

export interface VirtualAccountDto {
  unique_id: string;
  country: string;
  currency: string;
  account_number: string | null;
  account_holder_name: string | null;
  account_holder_address: string | null;
  account_bank_name: string | null;
  account_bank_code: string | null;
  account_bank_address: string | null;
  routing_number: string | null;
  external_type: string | null;
  external_reference_id: string | null;
  status: number;
  balance?: string;
  swift?: VirtualAccountDto | null;
}

export function virtualAccountResource(
  va: VirtualAccount & { swift?: VirtualAccount | null; balance?: string },
): VirtualAccountDto {
  const dto: VirtualAccountDto = {
    unique_id: va.uniqueId,
    country: va.country,
    currency: va.currency,
    account_number: va.accountNumber,
    account_holder_name: va.accountHolderName,
    account_holder_address: va.accountHolderAddress,
    account_bank_name: va.accountBankName,
    account_bank_code: va.accountBankCode,
    account_bank_address: va.accountBankAddress,
    routing_number: va.routingNumber,
    external_type: va.externalType,
    external_reference_id: va.externalReferenceId,
    status: va.status,
  };
  if (va.balance !== undefined) dto.balance = va.balance;
  if (va.swift) dto.swift = virtualAccountResource(va.swift);
  return dto;
}
