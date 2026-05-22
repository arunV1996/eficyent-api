import { VirtualAccount } from "@prisma/client";
import {
  formatDate,
  getFlagUrl,
} from "../../helpers/lookups";
import { virtualAccountStatusLabel } from "../../helpers/constants";

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
  flag: string;
  status: string;
  created_at: string;
  balance: number;
  memo: string;
  swift?: VirtualAccountDto | null;
}

export function virtualAccountResource(
  va: VirtualAccount & { swift?: VirtualAccount | null; balance?: string },
  userMemo: string = "",
  baseUrl: string = "",
): VirtualAccountDto {
  const dto: VirtualAccountDto = {
    unique_id: va.uniqueId,
    country: va.country ?? "",
    currency: va.currency,
    account_number: va.accountNumber,
    account_holder_name: va.accountHolderName,
    account_holder_address: va.accountHolderAddress,
    account_bank_name: va.accountBankName,
    account_bank_code: va.accountBankCode ?? "",
    account_bank_address: va.accountBankAddress,
    routing_number: va.routingNumber,
    flag: getFlagUrl(va.country, baseUrl),
    status: virtualAccountStatusLabel(va.status),
    created_at: formatDate(va.createdAt),
    balance: Number(parseFloat(va.balance ?? "0").toFixed(2)),
    memo: userMemo,
  };
  if (va.swift) {
    dto.swift = virtualAccountResource(va.swift, userMemo, baseUrl);
  }
  return dto;
}
