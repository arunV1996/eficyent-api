import { query, ValidationChain } from "express-validator";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chains for the /dashboard surface — mirror of
 * validators/dashboard/dashboardValidators.ts.
 */


/**
 * GET /dashboard/statistics (mirror of StatisticsQuerySchema).
 */
export const dashboardStatisticsQueryValidator: ValidationChain[] = [
    query("bank_account_id")
        .optional()
        .isString()
        .isLength({ min: 1 })
        .withMessage(localizedError("1100", 1100)),

    query("wallet_id")
        .optional()
        .isString()
        .isLength({ min: 1 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * GET /dashboard/charts-data (mirror of ChartsDataQuerySchema).
 */
export const dashboardChartsDataQueryValidator: ValidationChain[] = [
    query("bank_account_id")
        .optional()
        .isString()
        .isLength({ min: 1 })
        .withMessage(localizedError("1100", 1100)),

    query("wallet_id")
        .optional()
        .isString()
        .isLength({ min: 1 })
        .withMessage(localizedError("1100", 1100)),

    query("last_x_days").optional().isInt({ min: 1, max: 365 }).toInt(),
];
