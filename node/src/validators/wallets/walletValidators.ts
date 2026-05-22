import { z } from "zod";

export const WalletListQuerySchema = z
  .object({
    status: z.string().max(64).optional(),
    currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
    search_key: z.string().max(64).optional(),
    only_with_balance: z
      .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal(1), z.literal(0)])
      .optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type WalletListInput = z.infer<typeof WalletListQuerySchema>;

export const WalletShowSchema = z
  .object({
    wallet_id: z.string().min(1).max(64).optional(),
    with_balance: z
      .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal(1), z.literal(0)])
      .optional(),
  })
  .strict();
export type WalletShowInput = z.infer<typeof WalletShowSchema>;

export const ConvertSchema = z
  .object({ quote_id: z.string().min(1).max(64) })
  .strict();
export type ConvertInput = z.infer<typeof ConvertSchema>;

export const WalletTransactionsQuerySchema = z
  .object({
    wallet_id: z.string().min(1).max(64).optional(),
    transaction_type: z.coerce.number().int().min(1).max(2).optional(),
    status: z.coerce.number().int().min(0).max(4).optional(),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search_key: z.string().max(64).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type WalletTransactionsInput = z.infer<typeof WalletTransactionsQuerySchema>;

export const WalletTransactionShowSchema = z
  .object({ wallet_transaction_id: z.string().min(1).max(64) })
  .strict();
export type WalletTransactionShowInput = z.infer<typeof WalletTransactionShowSchema>;
