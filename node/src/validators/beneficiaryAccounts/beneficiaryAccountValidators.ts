import { z } from "zod";
import { USER_TYPE_BUSINESS, USER_TYPE_INDIVIDUAL } from "../../helpers/constants";
import { USER_TYPE_MAP } from "../../helpers/lookups";

/**
 * Static envelopes around the dynamic beneficiary form:
 *   - get_form_fields: needs (type, country, currency)
 *   - show / delete:   needs beneficiary_account_id
 *   - validate_account: needs (account_number, ifsc)
 *   - bulk_store: needs (file?, country, currency, verification_code?)
 *   - store: dynamic body, validated against beneficiaryFormFields()
 */

const recipientType = z
  .union([
    z.literal(USER_TYPE_INDIVIDUAL),
    z.literal(USER_TYPE_BUSINESS),
    z.enum(Object.keys(USER_TYPE_MAP) as [string, ...string[]]),
  ])
  .transform((v) => (typeof v === "number" ? v : USER_TYPE_MAP[v]!));

export const FormFieldsQuerySchema = z
  .object({
    type: recipientType,
    country: z.string().min(2).max(3),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
  })
  .strict();
export type FormFieldsQueryInput = z.infer<typeof FormFieldsQuerySchema>;

export const BeneficiaryShowSchema = z
  .object({ beneficiary_account_id: z.string().min(1).max(64) })
  .strict();
export type BeneficiaryShowInput = z.infer<typeof BeneficiaryShowSchema>;

export const BeneficiaryListQuerySchema = z
  .object({
    type: z.enum(Object.keys(USER_TYPE_MAP) as [string, ...string[]]).optional(),
    payment_rail: z.string().optional(),
    status: z.string().optional(),
    recipient_country: z.string().max(3).optional(),
    recipient_currency: z.string().max(3).optional(),
    search_key: z.string().max(128).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type BeneficiaryListInput = z.infer<typeof BeneficiaryListQuerySchema>;

export const ValidateAccountSchema = z
  .object({
    account_number: z.string().regex(/^\d{9,18}$/),
    ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/),
  })
  .strict();
export type ValidateAccountInput = z.infer<typeof ValidateAccountSchema>;

export const BulkStoreBodySchema = z
  .object({
    type: z
      .union([z.literal(USER_TYPE_INDIVIDUAL), z.literal(USER_TYPE_BUSINESS)])
      .optional(),
    country: z.string().min(2).max(3),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    verification_code: z.string().max(20).optional(),
  })
  .strict();
export type BulkStoreInput = z.infer<typeof BulkStoreBodySchema>;
