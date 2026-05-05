import { z } from "zod";

/**
 * Mirror of DashboardController query inputs. Both endpoints take
 * optional bank_account_id (VA unique_id) / wallet_id (Wallet
 * unique_id), and charts-data takes an optional last_x_days integer.
 */

export const StatisticsQuerySchema = z
  .object({
    bank_account_id: z.string().min(1).optional(),
    wallet_id: z.string().min(1).optional(),
  })
  .strict();

export type StatisticsQuery = z.infer<typeof StatisticsQuerySchema>;

export const ChartsDataQuerySchema = z
  .object({
    bank_account_id: z.string().min(1).optional(),
    wallet_id: z.string().min(1).optional(),
    last_x_days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();

export type ChartsDataQuery = z.infer<typeof ChartsDataQuerySchema>;
