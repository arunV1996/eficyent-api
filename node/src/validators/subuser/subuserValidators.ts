import { z } from "zod";
import { Mr, Mrs, Miss } from "../../helpers/constants";
import { isDisposableEmail, PASSWORD_REGEX } from "../../helpers/lookups";

const nameRegex = /^[A-Za-z\s]+$/;

export const SubUserStoreSchema = z
  .object({
    title: z.enum([Mr, Mrs, Miss]),
    first_name: z.string().min(1).max(255).regex(nameRegex),
    middle_name: z.string().max(255).regex(nameRegex).optional(),
    last_name: z.string().max(255).regex(nameRegex).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(255)
      .refine((e) => !isDisposableEmail(e), "Please use a valid email address."),
    mobile_country_code: z.string().regex(/^\d{1,7}$/),
    mobile: z.string().regex(/^\d{8,15}$/),
  })
  .strict();
export type SubUserStoreInput = z.infer<typeof SubUserStoreSchema>;

export const SubUserShowSchema = z
  .object({ subuser_id: z.string().min(1).max(64) })
  .strict();
export type SubUserShowInput = z.infer<typeof SubUserShowSchema>;

export const AcceptInviteSchema = z
  .object({
    invite_token: z.string().min(20).max(2_000),
    password: z.string().min(8).max(128).regex(PASSWORD_REGEX, "Password format is invalid."),
    password_confirmation: z.string().min(8).max(128),
  })
  .strict()
  .refine((v) => v.password === v.password_confirmation, {
    message: "Password confirmation does not match.",
    path: ["password_confirmation"],
  });
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>;
