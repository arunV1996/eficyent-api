import { User } from "@prisma/client";
import {
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import { senderFields } from "../../helpers/formFields";
import {
  ensureNoFieldErrors,
  validateAgainstFields,
} from "../../helpers/formFieldsValidator";
import { ApiException } from "../../helpers/errors";

/**
 * Mirror of App\\Validators\\SenderValidator. Coerces type variants
 * (PERSONAL/BUSINESS, "Individual"/"Business") to the numeric form, runs the
 * dynamic field rules, then reshapes:
 *
 *   - business_name -> first_name (when type=BUSINESS)
 *   - owners        -> business_persons
 */

function coerceType(input: unknown): number {
  if (input === USER_TYPE_INDIVIDUAL || input === USER_TYPE_BUSINESS) return input;
  if (typeof input === "string") {
    const upper = input.trim().toUpperCase();
    if (upper === "PERSONAL" || upper === "INDIVIDUAL") return USER_TYPE_INDIVIDUAL;
    if (upper === "BUSINESS") return USER_TYPE_BUSINESS;
    const n = Number(upper);
    if (n === USER_TYPE_INDIVIDUAL || n === USER_TYPE_BUSINESS) return n;
  }
  return USER_TYPE_INDIVIDUAL;
}

export interface NormalizedSender extends Record<string, unknown> {
  type: number;
  first_name?: string;
  business_persons?: unknown;
}

export async function validateAndNormalizeSender(
  payload: Record<string, unknown>,
  user: User,
  remitterDepositEnabled: boolean,
): Promise<NormalizedSender> {
  const type = coerceType(payload.type);
  const merchantIdRaw = user.merchantId
    ? await import("../../db/prisma").then(({ prisma }) =>
        prisma()
          .merchant.findFirst({ where: { uniqueId: user.merchantId! } })
          .then((m) => m?.id ?? null),
      )
    : null;
  const fields = await senderFields({
    type,
    merchantId: merchantIdRaw,
    remitterDepositEnabled,
  });
  if (fields.length === 0) throw new ApiException(132);

  const result = validateAgainstFields(fields, { ...payload, type });
  const validated = ensureNoFieldErrors(result) as NormalizedSender;
  validated.type = type;

  if (type === USER_TYPE_BUSINESS) {
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
}
