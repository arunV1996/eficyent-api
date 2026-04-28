import { z } from "zod";
import { PASSWORD_REGEX } from "../../helpers/lookups";

const password = z
  .string()
  .min(8)
  .max(128)
  .regex(PASSWORD_REGEX, "Password format is invalid.");

export const ChangePasswordSchema = z
  .object({
    old_password: z.string().min(1).max(128),
    password,
    password_confirmation: z.string().min(1).max(128),
  })
  .strict()
  .refine((v) => v.password === v.password_confirmation, {
    message: "Password confirmation does not match.",
    path: ["password_confirmation"],
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const DeleteAccountSchema = z
  .object({ password: z.string().min(1).max(128) })
  .strict();
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;

export const PasswordVerificationSchema = z
  .object({
    password: z.string().min(1).max(128),
    verification_code: z.string().min(1).max(20),
  })
  .strict();
export type PasswordVerificationInput = z.infer<typeof PasswordVerificationSchema>;

export const RegenerateBackupCodesSchema = z
  .object({ password: z.string().min(1).max(128) })
  .strict();
export type RegenerateBackupCodesInput = z.infer<typeof RegenerateBackupCodesSchema>;

/**
 * UpdateProfileRequest in Laravel is dynamic (FieldsHelper::updateProfileFormFields).
 * We accept a permissive schema here that mirrors what the form fields ask for,
 * with strict typing on the document sub-objects. The full dynamic rules
 * generator from FieldsHelper lands when the Onboarding/FvBank module is
 * ported (Phase 3).
 */
const documentBlock = z
  .object({
    document_file: z.string().optional(),
    document_back_file: z.string().optional(),
    document_expiry_date: z.string().optional(),
  })
  .strict()
  .optional();

export const UpdateProfileSchema = z
  .object({
    business_verification_type: z.string().max(64).optional(),
    proof_of_address: documentBlock,
    source_of_funds: documentBlock,
    id_document: documentBlock,
    proof_of_ownership: documentBlock,
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
