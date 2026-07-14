import { Request, Response } from "express";
import { CodedError } from "../helpers/coded_error.helper";
import {
    chartsData as buildChartsData,
    statistics as buildStatistics,
} from "../helpers/dashboard.helper";

/**
 * Mirror of App\Http\Controllers\Api\DashboardController (via the
 * legacy dashboardController). Both endpoints respond with the
 * empty-envelope shape ({success, message: "", code: "", data}).
 *
 * Deferred with the team module: the team-side variant that passes
 * the authenticated TeamMember for CORPORATE-role narrowing.
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

/**
 * GET /api/user/dashboard/statistics
 */
export const statistics = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const statisticsData = await buildStatistics(
            {
                bank_account_id: query.bank_account_id,
                wallet_id: query.wallet_id,
            },
            req.user,
        );
        return res.sendEmptyEnvelope({ statistics: statisticsData }, "");
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/dashboard/charts-data
 */
export const chartsData = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const data = await buildChartsData(
            {
                bank_account_id: query.bank_account_id,
                wallet_id: query.wallet_id,
                last_x_days:
                    query.last_x_days !== undefined
                        ? Number(query.last_x_days)
                        : undefined,
            },
            req.user,
        );
        return res.sendEmptyEnvelope(
            data as Record<string, unknown>,
            "",
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
