import { z } from "zod";
import { EXTERNAL_TYPE_CALIZA, EXTERNAL_TYPE_FVBANK } from "../../helpers/constants";

const ALLOWED_PROVIDERS = [EXTERNAL_TYPE_CALIZA, EXTERNAL_TYPE_FVBANK] as const;

export const ActivateSchema = z
  .object({
    type: z.enum(ALLOWED_PROVIDERS),
  })
  .strict();
export type ActivateInput = z.infer<typeof ActivateSchema>;

export const VirtualAccountIdSchema = z
  .object({
    unique_id: z.string().min(1).max(64),
    with_balance: z
      .union([z.literal("0"), z.literal("1"), z.literal(0), z.literal(1), z.boolean()])
      .optional()
      .transform((v) => (v === true || v === 1 || v === "1") ? 1 : 0),
  })
  .strict();
export type VirtualAccountIdInput = z.infer<typeof VirtualAccountIdSchema>;

export const VirtualAccountListSchema = z
  .object({
    country: z.string().max(100).optional(),
    currency: z.string().max(100).optional(),
    account_number: z.string().max(64).optional(),
    account_holder_name: z.string().max(255).optional(),
    account_bank_name: z.string().max(255).optional(),
    status: z.string().max(64).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
    with_balance: z
      .union([z.literal("0"), z.literal("1"), z.literal(0), z.literal(1), z.boolean()])
      .optional(),
  })
  .strict();
export type VirtualAccountListInput = z.infer<typeof VirtualAccountListSchema>;
