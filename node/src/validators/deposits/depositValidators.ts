import { z } from "zod";
import {
  DEPOSIT_TYPE_MAP,
} from "../../helpers/constants";
import {
  DEPOSIT_PURPOSE,
  DEPOSIT_SOURCE_OF_FUNDS,
} from "../../helpers/lookups";

const depositCurrency = z.string();
const depositTypeKey = z.enum(Object.keys(DEPOSIT_TYPE_MAP) as [string, ...string[]]);
const sourceOfFunds = z.enum(
  Object.keys(DEPOSIT_SOURCE_OF_FUNDS) as [string, ...string[]],
);
const purposeOfPayment = z.enum(
  Object.keys(DEPOSIT_PURPOSE) as [string, ...string[]],
);

// Either an HTTPS URL or a base64 data URL (image / pdf, max ~5MB).
const documentInput = z
  .string()
  .max(8 * 1024 * 1024)
  .refine(
    (v) =>
      v.startsWith("https://") ||
      /^data:(image\/(jpeg|jpg|png|gif)|application\/pdf);base64,/.test(v),
    "Must be an HTTPS URL or a base64 image/PDF data URL.",
  );

export const DepositCreateSchema = z
  .object({
    bank_account_id: z.string().min(1).max(64),
    amount: z.coerce.number().positive().min(1).max(10_000_000),
    type: depositTypeKey.optional(),
    source_of_funds: sourceOfFunds.optional(),
    purpose_of_payment: purposeOfPayment.optional(),
    proof: documentInput.optional(),
    deposit_currency: depositCurrency.optional(),
    from_wallet_address: z.string().max(255).optional(),
    to_wallet_id: z.string().min(1).max(64).optional(),
    transaction_hash: z.string().max(255).optional(),
    client_reference_id: z.string().max(128).optional(),
  })
  .strict()
  .transform((v) => ({
    ...v,
    type: v.type ? (DEPOSIT_TYPE_MAP[v.type] as string) : undefined,
  }));
export type DepositCreateInput = {
  bank_account_id: string;
  amount: number;
  type?: string;
  source_of_funds?: string;
  purpose_of_payment?: string;
  proof?: string;
  deposit_currency?: string;
  from_wallet_address?: string;
  to_wallet_id?: string;
  transaction_hash?: string;
  client_reference_id?: string;
};

export const DepositQuoteSchema = z
  .object({
    bank_account_id: z.string().min(1).max(64),
    amount: z.coerce.number().positive().min(1).max(10_000_000),
    deposit_currency: depositCurrency.optional(),
  })
  .strict();
export type DepositQuoteInput = z.infer<typeof DepositQuoteSchema>;

export const DepositShowSchema = z
  .object({ deposit_transaction_id: z.string().min(1).max(64) })
  .strict();
export type DepositShowInput = z.infer<typeof DepositShowSchema>;

export const DepositListQuerySchema = z
  .object({
    status: z.string().max(64).optional(),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search_key: z.string().max(128).optional(),
    bank_account_id: z.string().min(1).max(64).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
    type: z.string().max(20).optional(),
  })
  .strict();
export type DepositListInput = z.infer<typeof DepositListQuerySchema>;

export const DepositTrxnParamSchema = z.object({
  trxn: z.string().min(1).max(64),
});
export type DepositTrxnParam = z.infer<typeof DepositTrxnParamSchema>;
