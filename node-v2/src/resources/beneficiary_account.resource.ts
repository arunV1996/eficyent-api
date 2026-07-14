import { findValueByKey, getStateName } from "../helpers/lookup.helper";
import BeneficiaryAccount from "../models/beneficiary_account.model";
import BeneficiaryAdditionalDetail from "../models/beneficiary_additional_detail.model";
import { formatDateHuman } from "../utils/common.utils";
import {
    BENEFICIARY_ACCOUNT_STATUS_MAP,
    USER_TYPE_BUSINESS,
} from "../utils/constants";

/**
 * Mirror of App\Http\Resources\BeneficiaryAccountResource (via the
 * legacy beneficiaryResource.ts). Empty values are stripped
 * recursively — filterEmptyValues — so the JSON structure matches the
 * existing integrations exactly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const filterEmptyValues = (value: any): any => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (Array.isArray(value)) {
        const filteredItems = value
            .map((item) => filterEmptyValues(item))
            .filter((item) => item !== undefined);
        return filteredItems.length > 0 ? filteredItems : undefined;
    }
    if (typeof value === "object" && !(value instanceof Date)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filteredObject: any = {};
        let hasKeys = false;
        for (const key of Object.keys(value)) {
            const filteredValue = filterEmptyValues(value[key]);
            if (filteredValue !== undefined) {
                filteredObject[key] = filteredValue;
                hasKeys = true;
            }
        }
        return hasKeys ? filteredObject : undefined;
    }
    return value;
};

export const beneficiaryAccountToJSON = async (
    account: BeneficiaryAccount,
): Promise<Record<string, unknown>> => {
    const statusLabel =
        Object.keys(BENEFICIARY_ACCOUNT_STATUS_MAP).find(
            (key) => BENEFICIARY_ACCOUNT_STATUS_MAP[key] === account.status,
        ) ?? "PENDING";

    const additionalDetails = account.additionalDetails as
        | BeneficiaryAdditionalDetail[]
        | BeneficiaryAdditionalDetail
        | undefined;
    const detail = Array.isArray(additionalDetails)
        ? additionalDetails[0]
        : additionalDetails;

    const isBusiness = Number(account.type) === USER_TYPE_BUSINESS;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
        unique_id: account.uniqueId ?? "",
        country: account.country ?? "",
        currency: account.currency ?? "",
        type: isBusiness ? "BUSINESS" : "PERSONAL",
        email: account.email ?? "",
        mobile_country_code: account.mobileCountryCode ?? "",
        mobile: account.mobile ?? "",
        payment_rail: account.paymentRail ?? "",
        bank_name: account.bankName ?? "",
        routing_number: account.routingNumber ?? "",
        account_number: account.accountNumber ?? "",
        account_type: account.accountType ?? "",
        swift_code: account.swiftCode ?? "",
        iban: account.iban ?? "",
        intermediary_bank_swift_code: account.intermediaryBankSwiftCode ?? "",
        intermediary_bank_name: account.intermediaryBankName ?? "",
        intermediary_bank_aba: account.intermediaryBankAba ?? "",
        intermediary_bank_address: account.intermediaryBankAddress ?? "",
        intermediary_bank_city: account.intermediaryBankCity ?? "",
        intermediary_bank_state: account.intermediaryBankState ?? "",
        intermediary_bank_postal_code: account.intermediaryBankPostalCode ?? "",
        intermediary_bank_country: account.intermediaryBankCountry ?? "",
        bank_country: account.bankCountry ?? "",
        user_source_of_income: detail?.userSourceOfIncome
            ? await findValueByKey(detail.userSourceOfIncome)
            : "",
        purpose_of_transaction: detail?.purposeOfTransaction
            ? await findValueByKey(detail.purposeOfTransaction)
            : "",
        status: statusLabel,
        additional_details: detail
            ? {
                  recipient_address: {
                      address_line1: detail.addressLine1 ?? "",
                      address_line2: detail.addressLine2 ?? "",
                      postal_code: detail.postalCode ?? "",
                      city: detail.city ?? "",
                      state: await getStateName(detail.state, detail.country),
                      country: detail.country ?? "",
                  },
                  bank_address: {
                      address_line1: detail.bankAddressLine1 ?? "",
                      address_line2: detail.bankAddressLine2 ?? "",
                      postal_code: detail.bankPostalCode ?? "",
                      city: detail.bankCity ?? "",
                      state: await getStateName(
                          detail.bankState,
                          detail.bankCountry,
                      ),
                      country: detail.bankCountry ?? "",
                  },
              }
            : null,
        created_at: formatDateHuman(account.createdAt),
    };

    if (!isBusiness) {
        data.first_name = account.firstName ?? "";
        data.middle_name = account.middleName ?? "";
        data.last_name = account.lastName ?? "";
        data.account_name =
            account.accountName ||
            `${account.firstName ?? ""} ${account.lastName ?? ""}`.trim();
    } else {
        data.business_name = account.businessName ?? "";
        data.business_country = account.businessCountry ?? "";
        data.account_name = account.accountName ?? "";
    }

    return filterEmptyValues(data) ?? {};
};
