import { z } from "zod";
import { TRANSACTION_TYPE_MAP } from "../../helpers/constants";

const flexibleDateSchema = z
  .string()
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}-\d{2}-\d{4}$/.test(v),
    "Must be in YYYY-MM-DD or DD-MM-YYYY format.",
  )
  .transform((v) => {
    if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
      const [day, month, year] = v.split("-");
      return `${year}-${month}-${day}`;
    }
    return v;
  });

export const LedgerListSchema = z
  .object({
    from_date: flexibleDateSchema.optional(),
    to_date: flexibleDateSchema.optional(),
    transaction_type: z
      .enum(Object.keys(TRANSACTION_TYPE_MAP) as [string, ...string[]])
      .optional(),
    search_key: z.string().max(128).optional(),
    bank_account_id: z.string().min(1).max(64).optional(),
    wallet_id: z.string().min(1).max(64).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).optional(),
    type: z.string().max(20).optional(),
    receiving_currency: z.string().max(10).optional(),
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
  receiving_currency?: string;
};

export const LedgerShowSchema = z
  .object({ ledger_id: z.string().min(1).max(64) })
  .strict();
export type LedgerShowInput = z.infer<typeof LedgerShowSchema>;
