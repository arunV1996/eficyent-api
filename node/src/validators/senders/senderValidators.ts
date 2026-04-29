import { z } from "zod";
import { USER_TYPE_MAP } from "../../helpers/lookups";

const userTypeKey = z.enum(Object.keys(USER_TYPE_MAP) as [string, ...string[]]);

export const SenderFormFieldsQuerySchema = z
  .object({
    type: userTypeKey.optional(),
    remitter_id: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.type ?? v.remitter_id), "type or remitter_id required");
export type SenderFormFieldsInput = z.infer<typeof SenderFormFieldsQuerySchema>;

export const SenderShowQuerySchema = z
  .object({
    remitter_id: z.string().min(1).max(64).optional(),
    id_number: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
  })
  .strict()
  .refine(
    (v) => [v.remitter_id, v.id_number, v.email].filter(Boolean).length === 1,
    "Exactly one of remitter_id, id_number, email is required.",
  );
export type SenderShowInput = z.infer<typeof SenderShowQuerySchema>;

export const SenderListQuerySchema = z
  .object({
    type: userTypeKey.optional(),
    status: z.string().optional(),
    search_key: z.string().max(128).optional(),
    skip: z.coerce.number().int().min(0).max(100_000).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type SenderListInput = z.infer<typeof SenderListQuerySchema>;

export const SenderUpdateBodySchema = z
  .object({
    remitter_id: z.string().min(1).max(64),
  })
  .passthrough();
export type SenderUpdateInput = z.infer<typeof SenderUpdateBodySchema>;
