import { z } from "zod";
import {
  USER_TYPE_BUSINESS,
  USER_TYPE_INDIVIDUAL,
  USER_TYPE_PENDING,
} from "../../helpers/constants";

/**
 * Validators mirror the rules in app/Http/Requests/Auth/* . Naming is
 * preserved (snake_case keys) so existing API consumers continue to work.
 *
 * Strict mode is ON (`.strict()`) where the original FormRequest used
 * `Helper::blockExtraFields` - that prevents attackers from smuggling
 * privileged fields through the request body.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email();

const password = z
  .string()
  .min(8)
  .max(128)
  // At least one upper, one lower, one digit, one symbol.
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
    "Password must include upper, lower, digit, and symbol.",
  );

const deviceType = z.enum(["android", "ios", "web"]).optional();
const deviceId = z.string().max(255).optional();

export const LoginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    device_id: deviceId,
    device_type: deviceType,
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;

export const TfaLoginSchema = z
  .object({
    email,
    verification_code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Verification code must be 6 digits."),
  })
  .strict();

export type TfaLoginInput = z.infer<typeof TfaLoginSchema>;

export const RegisterSchema = z
  .object({
    email,
    password,
    title: z.string().max(5).optional(),
    first_name: z.string().min(1).max(100).optional(),
    middle_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    mobile_country_code: z.string().max(8).optional(),
    mobile: z.string().min(4).max(20).optional(),
    user_type: z
      .union([z.literal(USER_TYPE_PENDING), z.literal(USER_TYPE_INDIVIDUAL), z.literal(USER_TYPE_BUSINESS)])
      .optional(),
    timezone: z.string().max(30).optional(),
    country: z.string().min(2).max(3).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const ForgotPasswordSchema = z.object({ email }).strict();
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const VerifyCodeSchema = z
  .object({
    email,
    verification_code: z.string().regex(/^\d{6}$/, "Verification code must be 6 digits."),
  })
  .strict();
export type VerifyCodeInput = z.infer<typeof VerifyCodeSchema>;

export const ResetPasswordSchema = z
  .object({
    reset_token: z.string().min(20).max(200),
    password,
  })
  .strict();
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
