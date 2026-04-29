import { z } from "zod";
import { BENEFICIARY_TRANSACTION_APPROVAL_MAP } from "../../helpers/constants";

/**
 * Validators for the full BeneficiaryTransaction surface (Phase 6).
 * The dynamic /direct and /instant endpoints accept nested objects that
 * the controller hands off to the beneficiary + sender + transaction
 * normalizers; here we only enforce the top-level shape.
 */

const documentInput = z
  .string()
  .max(8 * 1024 * 1024)
  .refine(
    (v) =>
      v.startsWith("https://") ||
      /^data:(image\/(jpeg|jpg|png|gif)|application\/pdf);base64,/.test(v),
    "Must be an HTTPS URL or a base64 image/PDF data URL.",
  );

export const PayoutStoreSchema = z
  .object({
    beneficiary_account_id: z.string().min(1).max(64),
    quote_id: z.string().min(1).max(64),
    remitter_id: z.string().min(1).max(64).optional(),
    remarks: z.string().max(255).optional(),
    supporting_document: documentInput.optional(),
    txn_ref_no: z.string().max(255).optional(),
    purpose_of_payment: z.string().max(255).optional(),
    client_reference_id: z.string().max(255).optional(),
    verification_code: z.string().regex(/^\d{6}$/).optional(),
  })
  .strict();
export type PayoutStoreInput = z.infer<typeof PayoutStoreSchema>;

export const PayoutShowSchema = z
  .object({
    beneficiary_transaction_id: z.string().min(1).max(64).optional(),
    txn_ref_no: z.string().min(1).max(255).optional(),
    client_reference_id: z.string().min(1).max(255).optional(),
  })
  .strict()
  .refine(
    (v) =>
      Boolean(
        v.beneficiary_transaction_id ?? v.txn_ref_no ?? v.client_reference_id,
      ),
    "One of beneficiary_transaction_id / txn_ref_no / client_reference_id is required.",
  );
export type PayoutShowInput = z.infer<typeof PayoutShowSchema>;

export const PayoutListQuerySchema = z
  .object({
    status: z.string().max(64).optional(),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    bank_account_id: z.string().min(1).max(64).optional(),
    wallet_id: z.string().min(1).max(64).optional(),
    search_key: z.string().max(128).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
    type: z.coerce.number().int().min(1).max(2).optional(),
  })
  .strict();
export type PayoutListInput = z.infer<typeof PayoutListQuerySchema>;

export const PayoutCancelSchema = z
  .object({
    beneficiary_transaction_ids: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(100),
    remarks: z.string().max(255).optional(),
  })
  .strict();
export type PayoutCancelInput = z.infer<typeof PayoutCancelSchema>;

export const PayoutUpdateStatusSchema = z
  .object({
    beneficiary_transaction_ids: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(100),
    status: z.enum(
      Object.keys(BENEFICIARY_TRANSACTION_APPROVAL_MAP) as [string, ...string[]],
    ),
    remarks: z.string().max(255).optional(),
  })
  .strict()
  .transform((v) => ({
    beneficiary_transaction_ids: v.beneficiary_transaction_ids,
    status: BENEFICIARY_TRANSACTION_APPROVAL_MAP[v.status] as number,
    remarks: v.remarks,
  }));
export type PayoutUpdateStatusInput = {
  beneficiary_transaction_ids: string[];
  status: number;
  remarks?: string;
};

export const GetFormFieldsSchema = z
  .object({
    type: z.string().max(20).optional(),
    country: z.string().min(2).max(10),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
  })
  .strict();
export type GetFormFieldsInput = z.infer<typeof GetFormFieldsSchema>;

export const InstantPayoutSchema = z
  .object({
    transaction: z.record(z.unknown()),
    remitter: z.record(z.unknown()),
    beneficiary: z.record(z.unknown()),
  })
  .strict();
export type InstantPayoutInput = z.infer<typeof InstantPayoutSchema>;

export const SendMoneyDirectSchema = z
  .object({
    transaction: z.record(z.unknown()),
    remitter: z.record(z.unknown()),
    beneficiary: z.record(z.unknown()),
    verification_code: z.string().regex(/^\d{6}$/).optional(),
  })
  .strict();
export type SendMoneyDirectInput = z.infer<typeof SendMoneyDirectSchema>;

export const TransactionProofRequestSchema = z
  .object({
    beneficiary_transaction_id: z.string().min(1).max(64),
    remitter_proof: documentInput,
  })
  .strict();
export type TransactionProofRequestInput = z.infer<typeof TransactionProofRequestSchema>;

export const TransactionProofGetSchema = z
  .object({ beneficiary_transaction_id: z.string().min(1).max(64) })
  .strict();
export type TransactionProofGetInput = z.infer<typeof TransactionProofGetSchema>;

export const RetryParamSchema = z.object({
  trxn: z.string().min(1).max(64),
});
export type RetryParam = z.infer<typeof RetryParamSchema>;

export const RetryJobParamSchema = z.object({
  jobId: z.string().min(1).max(64),
});
export type RetryJobParam = z.infer<typeof RetryJobParamSchema>;

export const BulkPayoutSchema = z
  .object({
    type: z.coerce.number().int().min(1).max(2).optional(),
    country: z.string().min(2).max(10),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    file_url: z.string().url(),
    verification_code: z.string().regex(/^\d{6}$/).optional(),
  })
  .strict();
export type BulkPayoutInput = z.infer<typeof BulkPayoutSchema>;
