import { z } from "zod";
import { TRANSACTION_TYPE_MAP } from "../../helpers/constants";

export const LedgerListSchema = z
  .object({
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    transaction_type: z
      .enum(Object.keys(TRANSACTION_TYPE_MAP) as [string, ...string[]])
      .optional(),
    search_key: z.string().max(128).optional(),
    bank_account_id: z.string().min(1).max(64).optional(),
    wallet_id: z.string().min(1).max(64).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
    type: z.string().max(20).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.bank_account_id ?? v.wallet_id),
    "Either bank_account_id or wallet_id is required.",
  )
  .refine(
    (v) => !(v.bank_account_id && v.wallet_id),
    "Either bank_account_id or wallet_id - not both.",
  )
  .transform((v) => ({
    ...v,
    transaction_type: v.transaction_type
      ? (TRANSACTION_TYPE_MAP[v.transaction_type] as number)
      : undefined,
  }));
export type LedgerListInput = {
  from_date?: string;
  to_date?: string;
  transaction_type?: number;
  search_key?: string;
  bank_account_id?: string;
  wallet_id?: string;
  skip?: number;
  take?: number;
  type?: string;
};

export const LedgerShowSchema = z
  .object({ ledger_id: z.string().min(1).max(64) })
  .strict();
export type LedgerShowInput = z.infer<typeof LedgerShowSchema>;
