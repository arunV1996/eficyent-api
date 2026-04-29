import { z } from "zod";
import { PASSWORD_REGEX } from "../../helpers/lookups";

const email = z.string().trim().toLowerCase().email().min(3).max(254);
const password = z
  .string()
  .min(8)
  .max(128)
  .regex(PASSWORD_REGEX, "Password format is invalid.");

export const TeamLoginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();
export type TeamLoginInput = z.infer<typeof TeamLoginSchema>;

export const ForceResetPasswordSchema = z
  .object({
    email,
    password,
    password_confirmation: z.string().min(1).max(128),
  })
  .strict()
  .refine((v) => v.password === v.password_confirmation, {
    message: "Password confirmation does not match.",
    path: ["password_confirmation"],
  });
export type ForceResetPasswordInput = z.infer<typeof ForceResetPasswordSchema>;

export const TeamForgotPasswordSchema = z.object({ email }).strict();
export type TeamForgotPasswordInput = z.infer<typeof TeamForgotPasswordSchema>;

export const TeamVerifyCodeSchema = z
  .object({
    email,
    verification_code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export type TeamVerifyCodeInput = z.infer<typeof TeamVerifyCodeSchema>;

export const TeamResetPasswordSchema = z
  .object({
    reset_token: z.string().min(20).max(200),
    password,
  })
  .strict();
export type TeamResetPasswordInput = z.infer<typeof TeamResetPasswordSchema>;

export const TeamChangePasswordSchema = z
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
export type TeamChangePasswordInput = z.infer<typeof TeamChangePasswordSchema>;
