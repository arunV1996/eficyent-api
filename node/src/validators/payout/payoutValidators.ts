import { z } from "zod";

/**
 * Payout request validation. Strict mode is on - any unexpected key is a
 * 422 error so the API surface can't be exploited via mass-assignment.
 *
 * The original Laravel BeneficiaryTransactionController uses field-driven
 * dynamic validation rules (Helper::buildFormRules) over the form-fields
 * config; that dynamic rule set is rebuilt in TypeScript when the
 * full BeneficiaryTransaction module is converted. For Phase 1 the schema
 * here covers the static, always-required fields - sufficient to demonstrate
 * the idempotency + queue dispatch end-to-end.
 */

const decimalString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? v : v.toString()))
  .refine((s) => /^\d+(\.\d{1,6})?$/.test(s), "Must be a positive decimal");

export const PayoutStoreSchema = z
  .object({
    beneficiary_account_id: z.string().min(1).max(64),
    sender_id: z.string().min(1).max(64),
    quote_id: z.string().min(1).max(64),
    amount: decimalString,
    currency: z.string().regex(/^[A-Z]{3}$/),
    purpose_of_transaction: z.string().min(1).max(64),
    source_of_funds: z.string().min(1).max(64),
    payment_rail: z.string().max(32).optional(),
    payment_method: z.string().max(64).optional(),
    remarks: z.string().max(500).optional(),
  })
  .strict();

export type PayoutStoreInput = z.infer<typeof PayoutStoreSchema>;
