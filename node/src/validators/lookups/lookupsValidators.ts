import { z } from "zod";
import {
  LOOKUP_TYPE_PURPOSE_OF_TRANSACTION,
  LOOKUP_TYPE_SOURCE_OF_FUNDS,
} from "../../helpers/constants";
import { USER_TYPE_MAP } from "../../helpers/lookups";

export const StatesQuerySchema = z
  .object({
    country_code: z.string().min(2).max(3).optional(),
  })
  .strict();

export const GetBanksQuerySchema = z
  .object({
    country_code: z.string().regex(/^[A-Za-z]{3}$/),
    currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  })
  .strict();

export const ReceivingCountriesQuerySchema = z
  .object({
    recipient_type: z.enum(Object.keys(USER_TYPE_MAP) as [string, ...string[]]),
  })
  .strict()
  .transform((v) => ({
    recipient_type: USER_TYPE_MAP[v.recipient_type] as number,
  }));

export type ReceivingCountriesInput = {
  recipient_type: number;
};

export const RefreshRateBodySchema = z
  .object({
    from_currency: z.string().regex(/^[A-Za-z]{3}$/),
    to_currency: z.string().regex(/^[A-Za-z]{3}$/),
    refresh_all: z.boolean().optional(),
    currency: z.string().optional(),
  })
  .strict()
  .refine(
    (v) => !(v.refresh_all && v.currency),
    "Cannot specify both refresh_all and currency.",
  );
export type RefreshRateInput = z.infer<typeof RefreshRateBodySchema>;

export const DepositLookupQuerySchema = z
  .object({
    type: z.enum([LOOKUP_TYPE_SOURCE_OF_FUNDS, LOOKUP_TYPE_PURPOSE_OF_TRANSACTION]),
    take: z.coerce.number().optional(),
    skip: z.coerce.number().optional(),
  });
export type DepositLookupInput = z.infer<typeof DepositLookupQuerySchema>;
