import Merchant from "../models/merchant.model";
import User from "../models/user.model";
import { CodedError } from "./coded_error.helper";
import { FormFieldsError, senderFields } from "./form_fields.helper";
import {
    firstFieldError,
    validateAgainstFields,
} from "./form_fields_validator.helper";
import { USER_TYPE_BUSINESS, USER_TYPE_PERSONAL } from "../utils/constants";

/**
 * Mirror of App\Validators\SenderValidator (via the legacy
 * senderNormalizer). Coerces type variants (PERSONAL/BUSINESS,
 * "Individual"/"Business") to the numeric form, runs the dynamic
 * sender field rules, then reshapes:
 *
 *   - business_name -> first_name   (when type=BUSINESS)
 *   - owners        -> business_persons
 *
 * Deferred with the bulk Excel import tranche: the per-request
 * memoization cache the legacy normalizer threads through bulk loops.
 */

const coerceType = (input: unknown): number => {
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

export interface NormalizedSender extends Record<string, unknown> {
    type: number;
    first_name?: string;
    business_persons?: unknown;
}

export const validateAndNormalizeSender = async (
    payload: Record<string, unknown>,
    user: User,
    remitterDepositEnabled: boolean,
): Promise<NormalizedSender> => {
    const senderType = coerceType(payload.type);

    let merchantId: number | null = null;
    if (user.merchantId) {
        const merchant = await Merchant.findByPk(user.merchantId);
        merchantId = merchant?.id ?? null;
    }

    const fields = await senderFields({
        type: senderType,
        merchantId,
        remitterDepositEnabled,
    });
    if (fields.length === 0) {
        throw new CodedError("Sender not found.", 132, 400);
    }

    const sanitizedPayload = { ...payload };
    if (typeof sanitizedPayload.mobile === "string") {
        sanitizedPayload.mobile = sanitizedPayload.mobile.replace(/^\+/, "");
    }

    const validationResult = validateAgainstFields(fields, {
        ...sanitizedPayload,
        type: senderType,
    });
    const validationError = firstFieldError(validationResult);
    if (validationError) {
        throw new FormFieldsError(validationError);
    }
    const validated = validationResult.validated as NormalizedSender;
    validated.type = senderType;

    if (senderType === USER_TYPE_BUSINESS) {
        if (typeof validated.business_name === "string") {
            validated.first_name = String(validated.business_name);
            delete (validated as Record<string, unknown>).business_name;
        }
        if (Array.isArray(validated.owners)) {
            validated.business_persons = validated.owners;
            delete (validated as Record<string, unknown>).owners;
        }
    }
    return validated;
};
