import { z } from "zod";

/**
 * Mirror of StaticPageGetRequest - either filter by `type` or by
 * `static_page_unique_id`. Laravel's controller treats them as additive.
 */
export const StaticPageShowSchema = z
  .object({
    type: z.string().min(1).max(50).optional(),
    static_page_unique_id: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.type ?? v.static_page_unique_id),
    "Either `type` or `static_page_unique_id` is required.",
  );

export type StaticPageShowInput = z.infer<typeof StaticPageShowSchema>;
