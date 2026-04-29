import { z } from "zod";
import {
  PAYMENT_RAIL_ACH,
  PAYMENT_RAIL_SWIFT,
  PAYMENT_RAIL_WIRE,
  QUOTE_TYPE_FORWARD,
  QUOTE_TYPE_REVERSE,
} from "../../helpers/constants";
import { USER_TYPE_MAP } from "../../helpers/lookups";

const recipientTypeKey = z.enum(Object.keys(USER_TYPE_MAP) as [string, ...string[]]);
const paymentRail = z
  .enum([
    PAYMENT_RAIL_ACH.toUpperCase(),
    PAYMENT_RAIL_SWIFT.toUpperCase(),
    PAYMENT_RAIL_WIRE.toUpperCase(),
  ] as [string, ...string[]])
  .transform((v) => v.toLowerCase());

export const QuoteStoreSchema = z
  .object({
    amount: z.coerce.number().positive().min(100),
    recipient_type: recipientTypeKey,
    recipient_country: z.string().min(2).max(10),
    receiving_currency: z.string().regex(/^[A-Za-z]{3}$/),
    bank_account_id: z.string().min(1).max(64).optional(),
    wallet_id: z.string().min(1).max(64).optional(),
    quote_type: z.enum([QUOTE_TYPE_FORWARD, QUOTE_TYPE_REVERSE]),
    payment_rail: paymentRail.optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.bank_account_id) !== Boolean(v.wallet_id),
    "Either bank_account_id or wallet_id - exactly one is required.",
  )
  .refine(
    (v) =>
      !(v.receiving_currency.toUpperCase() === "USD" && v.recipient_country === "USA")
      || Boolean(v.payment_rail),
    "payment_rail required for USD/USA.",
  );
export type QuoteStoreInput = z.infer<typeof QuoteStoreSchema>;
