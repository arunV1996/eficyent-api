import { z } from "zod";
import { ONBOARDING_STEP_MAP } from "../../helpers/constants";

/**
 * Mirror of GetFormFieldsRequest. The Laravel validator translates the
 * human-readable `type` (REGISTER_USER, GET_INFORMATION, GET_DOCUMENTS) into
 * the matching numeric ONBOARDING_STEP_*_COMPLETED. We do the same so the
 * controller never deals with the string form.
 */
export const GetFormFieldsSchema = z
  .object({
    type: z.enum(Object.keys(ONBOARDING_STEP_MAP) as [string, ...string[]]),
    country_of_incorporation: z.string().min(2).max(3).optional(),
  })
  .strict()
  .transform((v) => ({
    type: ONBOARDING_STEP_MAP[v.type] as number,
    country_of_incorporation: v.country_of_incorporation,
  }));
export type GetFormFieldsInput = {
  type: number;
  country_of_incorporation?: string;
};
