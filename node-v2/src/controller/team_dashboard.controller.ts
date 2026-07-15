import { Request, Response } from "express";
import { CodedError } from "../helpers/coded_error.helper";
import {
    chartsData as buildChartsData,
    statistics as buildStatistics,
} from "../helpers/dashboard.helper";

/**
 * Mirror of TeamMembers\DashboardController — same dashboard helper as
 * the user side with the authenticated TeamMember passed through for
 * the CORPORATE narrowing. Note the envelope difference from the
 * user-side dashboard: these respond with code 200, not "".
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

/**
 * GET /api/team/dashboard/statistics
 */
export const statistics = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user || !req.teamMember) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const query = req.query as Record<string, string | undefined>;
        const statisticsData = await buildStatistics(
            {
                bank_account_id: query.bank_account_id,
                wallet_id: query.wallet_id,
            },
            req.user,
            req.teamMember,
        );
        return res.sendResponse({ statistics: statisticsData }, "", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/team/dashboard/charts-data
 */
export const chartsData = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user || !req.teamMember) {
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
            req.teamMember,
        );
        return res.sendResponse(data as Record<string, unknown>, "", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};
