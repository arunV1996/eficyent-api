import VirtualAccount from "../models/virtual_account.model";
import {
    formatDateHuman,
    getFlagUrl,
    virtualAccountStatusLabel,
} from "../utils/common.utils";

/**
 * Mirror of App\Http\Resources\VirtualAccountResource (via the legacy
 * virtualAccountResource.ts). `balance`, `memo` and `swift_account`
 * appear only when the caller supplies them — same conditional shape
 * as legacy.
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
    flag: string;
    status: string;
    created_at: string;
    balance?: number;
    memo?: string;
    swift_account?: VirtualAccountDto | null;
}

export const virtualAccountToJSON = (
    virtualAccount: VirtualAccount & {
        swift?: VirtualAccount | null;
        balance?: string;
    },
    userMemo?: string | null,
    baseUrl = "",
    timezone?: string,
): VirtualAccountDto => {
    const dto: VirtualAccountDto = {
        unique_id: virtualAccount.uniqueId,
        country: virtualAccount.country ?? "",
        currency: virtualAccount.currency,
        account_number: virtualAccount.accountNumber,
        account_holder_name: virtualAccount.accountHolderName,
        account_holder_address: virtualAccount.accountHolderAddress,
        account_bank_name: virtualAccount.accountBankName,
        account_bank_code: virtualAccount.accountBankCode ?? "",
        account_bank_address: virtualAccount.accountBankAddress,
        routing_number: virtualAccount.routingNumber,
        flag: getFlagUrl(virtualAccount.country, baseUrl),
        status: virtualAccountStatusLabel(virtualAccount.status),
        created_at: formatDateHuman(virtualAccount.createdAt, timezone),
    };

    if (virtualAccount.balance !== undefined) {
        dto.balance = Number(
            parseFloat(virtualAccount.balance ?? "0").toFixed(2),
        );
    }

    if (userMemo !== undefined && userMemo !== null) {
        dto.memo = userMemo;
    }

    if (virtualAccount.swift !== undefined) {
        dto.swift_account = virtualAccount.swift
            ? virtualAccountToJSON(
                  virtualAccount.swift,
                  userMemo,
                  baseUrl,
                  timezone,
              )
            : null;
    }

    return dto;
};
