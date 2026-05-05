import { Request, Response } from "express";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { dashboardService } from "../../services/dashboards/dashboardService";
import {
  ChartsDataQuery,
  StatisticsQuery,
} from "../../validators/dashboard/dashboardValidators";

/**
 * Mirror of App\\Http\\Controllers\\TeamMembers\\DashboardController.
 *
 * Same dashboardService as the user-side controller, with the
 * authenticated TeamMember passed through so the CORPORATE-role
 * narrowing applies. Parent business user is `req.user` (set by the
 * teamAuth middleware).
 */
export const teamDashboardController = {
  async statistics(req: Request, res: Response): Promise<Response> {
    if (!req.user || !req.teamMember) throw new ApiException(102);
    const query = req.query as unknown as StatisticsQuery;
    const statistics = await dashboardService.statistics(
      query,
      req.user,
      req.teamMember,
    );
    return sendResponse(res, "", 200, { statistics });
  },

  async chartsData(req: Request, res: Response): Promise<Response> {
    if (!req.user || !req.teamMember) throw new ApiException(102);
    const query = req.query as unknown as ChartsDataQuery;
    const data = await dashboardService.chartsData(
      query,
      req.user,
      req.teamMember,
    );
    return sendResponse(res, "", 200, data);
  },
};
