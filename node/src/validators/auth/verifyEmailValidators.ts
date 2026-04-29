import { z } from "zod";

const email = z.string().trim().toLowerCase().email().min(3).max(254);

export const SendOtpSchema = z.object({ email }).strict();
export type SendOtpInput = z.infer<typeof SendOtpSchema>;

export const VerifyOtpSchema = z
  .object({
    email,
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits."),
  })
  .strict();
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
