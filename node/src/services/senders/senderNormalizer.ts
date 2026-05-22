import { User } from "@prisma/client";
import {
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import { senderFields, FieldDef } from "../../helpers/formFields";
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

/**
 * Optional per-request memoization for bulk imports. The merchant lookup is
 * constant for a user, and the dynamic sender form fields only vary by `type`.
 * Bulk loops pass one shared cache so these resolve once per distinct key
 * instead of once per row (each row otherwise issues ~14 redundant DB queries).
 */
export interface SenderValidationCache {
  merchantId?: bigint | null;
  merchantIdResolved: boolean;
  fields: Map<string, FieldDef[]>;
}

export function createSenderValidationCache(): SenderValidationCache {
  return { merchantIdResolved: false, fields: new Map() };
}

async function resolveMerchantId(user: User): Promise<bigint | null> {
  if (!user.merchantId) return null;
  const { prisma } = await import("../../db/prisma");
  const m = await prisma().merchant.findFirst({
    // @ts-expect-error - Auto-fixed bigint/string mismatch
    where: { uniqueId: user.merchantId },
  });
  return m?.id ?? null;
}

export async function validateAndNormalizeSender(
  payload: Record<string, unknown>,
  user: User,
  remitterDepositEnabled: boolean,
  cache?: SenderValidationCache,
): Promise<NormalizedSender> {
  const type = coerceType(payload.type);

  let merchantIdRaw: bigint | null;
  if (cache) {
    if (!cache.merchantIdResolved) {
      cache.merchantId = await resolveMerchantId(user);
      cache.merchantIdResolved = true;
    }
    merchantIdRaw = cache.merchantId ?? null;
  } else {
    merchantIdRaw = await resolveMerchantId(user);
  }

  let fields: FieldDef[];
  if (cache) {
    const fieldsKey = String(type);
    const hit = cache.fields.get(fieldsKey);
    if (hit) {
      fields = hit;
    } else {
      fields = await senderFields({ type, merchantId: merchantIdRaw, remitterDepositEnabled });
      cache.fields.set(fieldsKey, fields);
    }
  } else {
    fields = await senderFields({ type, merchantId: merchantIdRaw, remitterDepositEnabled });
  }
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
