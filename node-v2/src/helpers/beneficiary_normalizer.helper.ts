import ServiceBank from "../models/service_bank.model";
import User from "../models/user.model";
import {
    beneficiaryFormFields,
    FormFieldsError,
} from "./form_fields.helper";
import {
    firstFieldError,
    validateAgainstFields,
} from "./form_fields_validator.helper";
import {
    formatPaymentType,
    getPaymentRails,
    receivingCountries,
} from "./lookup.helper";
import {
    C2B,
    USER_TYPE_BUSINESS,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

/**
 * Mirror of App\Validators\BeneficiaryValidator (via the legacy
 * beneficiaryNormalizer). Builds dynamic rules per (country, currency,
 * type) and reshapes the validated payload into
 * { beneficiaryAccount, beneficiaryAccountAdditionalDetail } — the
 * structure the store endpoint persists.
 *
 * Corridor / validation failures raise FormFieldsError so the
 * controller can emit the legacy {success:false, error, error_code}
 * envelope.
 */

export interface NormalizedBeneficiaryPayload {
    beneficiaryAccount: Record<string, unknown>;
    beneficiaryAccountAdditionalDetail: Record<string, unknown>;
}

const coerceRecipientType = (input: unknown): number => {
    if (input === USER_TYPE_PERSONAL || input === USER_TYPE_BUSINESS) {
        return input;
    }
    if (typeof input === "string") {
        const upperInput = input.trim().toUpperCase();
        if (upperInput === "PERSONAL" || upperInput === "INDIVIDUAL") {
            return USER_TYPE_PERSONAL;
        }
        if (upperInput === "BUSINESS") {
            return USER_TYPE_BUSINESS;
        }
        const numericInput = Number(upperInput);
        if (
            numericInput === USER_TYPE_PERSONAL ||
            numericInput === USER_TYPE_BUSINESS
        ) {
            return numericInput;
        }
    }
    return USER_TYPE_PERSONAL;
};

export const validateAndNormalizeBeneficiary = async (
    payload: Record<string, unknown>,
    user: User,
): Promise<NormalizedBeneficiaryPayload> => {
    const recipientType = coerceRecipientType(payload.type);
    const country = String(payload.country ?? "");
    const currency = String(payload.currency ?? "");

    if (!country || !currency) {
        throw new FormFieldsError("country and currency are required.");
    }

    // Mirror of BeneficiaryValidator::rules — block C2B and verify the
    // country/currency pair against the user's allowed corridor list.
    const paymentType = formatPaymentType(user.userType, recipientType);
    if (paymentType === C2B) {
        throw new FormFieldsError(
            "C2B (consumer to business) is not supported.",
            195,
            400,
        );
    }

    const supportedCorridors = await receivingCountries(paymentType, user);
    const countryMatch = supportedCorridors.find(
        (corridor) => corridor.country_code === country,
    );
    if (!countryMatch) {
        throw new FormFieldsError(
            "Country is not supported for this beneficiary type.",
        );
    }
    if (!countryMatch.currencies.includes(currency)) {
        throw new FormFieldsError(
            "Currency is not supported for the selected country.",
        );
    }

    const fields = await beneficiaryFormFields({
        country,
        currency,
        type: recipientType,
        merchantId: user.merchantId,
    });
    // USA/BGD/CHN corridors require a valid payment rail before any of
    // the field-level checks run.
    if (country === "USA" || country === "BGD" || country === "CHN") {
        const paymentRail = payload.payment_rail;
        if (
            paymentRail === undefined ||
            paymentRail === null ||
            String(paymentRail).trim() === ""
        ) {
            throw new FormFieldsError("The payment rail field is required.");
        }
        const validRails = getPaymentRails(country).map((rail) => rail.value);
        if (!validRails.includes(String(paymentRail))) {
            throw new FormFieldsError("The selected payment rail is invalid.");
        }
    }

    const validationResult = validateAgainstFields(fields, payload);
    const validationError = firstFieldError(validationResult);
    if (validationError) {
        throw new FormFieldsError(validationError);
    }
    const validated = validationResult.validated;

    // SWIFT/BIC fallback chain: explicit swift_code -> code field ->
    // service-bank ISO code -> bank-name ISO lookup.
    let swiftCode = (validated.swift_code || validated.code) as
        | string
        | undefined;

    // service_bank arrives as our unique_id; persist the provider's
    // bank_id and display bank_name instead.
    let serviceBankBankId: string | undefined;
    let serviceBankName: string | undefined;
    if (validated.service_bank) {
        const serviceBankRow = await ServiceBank.findOne({
            where: { uniqueId: String(validated.service_bank) },
        });
        if (serviceBankRow) {
            serviceBankBankId = serviceBankRow.bankId;
            serviceBankName = serviceBankRow.bankName;
            if (!swiftCode && serviceBankRow.isoCode) {
                swiftCode = serviceBankRow.isoCode;
            }
        }
    }

    if (!swiftCode && validated.bank_name) {
        const bankByName = await ServiceBank.findOne({
            where: { bankName: String(validated.bank_name) },
        });
        if (bankByName?.isoCode) {
            swiftCode = bankByName.isoCode;
        }
    }

    // account_name fallback: derive from first/last or business name.
    const accountName =
        (validated.account_name as string | undefined) ||
        [validated.first_name, validated.last_name]
            .filter(Boolean)
            .map((namePart) => String(namePart).trim())
            .join(" ")
            .trim() ||
        (validated.business_name as string | undefined) ||
        "";

    const beneficiaryAccount: Record<string, unknown> = {
        type: recipientType,
        country,
        currency,
        first_name: validated.first_name ?? "",
        middle_name: validated.middle_name ?? "",
        last_name: validated.last_name ?? "",
        email: validated.email ?? "",
        mobile_country_code: validated.mobile_country_code ?? "",
        mobile: validated.mobile ?? "",
        // payment_rail is not part of the dynamic form builder array, so
        // validateAgainstFields strips it — pull it from the raw payload.
        payment_rail: (payload.payment_rail as string | undefined) ?? "",
        service_bank: serviceBankBankId ?? "",
        bank_name: serviceBankName ?? validated.bank_name ?? "",
        routing_number: validated.routing_number ?? validated.code ?? "",
        account_name: accountName,
        account_number: validated.account_number ?? "",
        account_type: validated.account_type ?? "",
        swift_code: swiftCode ?? "",
        iban: validated.iban ?? validated.account_number ?? "",
        intermediary_bank_swift_code:
            validated.intermediary_bank_swift_code ?? "",
        intermediary_bank_name: validated.intermediary_bank_name ?? "",
        intermediary_bank_aba: validated.intermediary_bank_aba ?? "",
        intermediary_bank_address: validated.intermediary_bank_address ?? "",
        intermediary_bank_city: validated.intermediary_bank_city ?? "",
        intermediary_bank_state: validated.intermediary_bank_state ?? "",
        intermediary_bank_postal_code:
            validated.intermediary_bank_postal_code ?? "",
        intermediary_bank_country: validated.intermediary_bank_country ?? "",
        bank_country: validated.bank_country ?? country,
        business_name: validated.business_name ?? "",
        business_country: validated.business_country ?? "",
        relationship: (validated.relationship as string | undefined) ?? null,
    };

    const beneficiaryAccountAdditionalDetail: Record<string, unknown> = {
        address_type: validated.address_type ?? "PRESENT",
        address_line1: validated.receiver_address_line_1 ?? "",
        address_line2: validated.receiver_address_line_2 ?? "",
        postal_code: validated.receiver_postal_code ?? "",
        city: validated.receiver_city ?? "",
        state: validated.receiver_state ?? "",
        country: validated.receiver_country ?? country,
        payment_type: validated.payment_type ?? "",
        bank_address_line1: validated.bank_address_line_1 ?? "",
        bank_address_line2: validated.bank_address_line_2 ?? "",
        bank_postal_code: validated.bank_postal_code ?? "",
        bank_city: validated.bank_city ?? "",
        bank_state: validated.bank_state ?? "",
        bank_country: validated.bank_country ?? country,
        purpose_of_transaction: validated.purpose_of_transaction ?? "",
        user_source_of_income: validated.source_of_funds ?? "",
    };

    return { beneficiaryAccount, beneficiaryAccountAdditionalDetail };
};
