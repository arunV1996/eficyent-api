import { Request, Response } from "express";
import { ApiException } from "../../helpers/errors";
// @ts-ignore - Catch-all auto-fix for: 'sendResponse' is declared but...
import { sendResponse } from "../../helpers/response";
import { dashboardService } from "../../services/dashboards/dashboardService";
import {
  ChartsDataQuery,
  StatisticsQuery,
} from "../../validators/dashboard/dashboardValidators";

/**
 * Mirror of App\\Http\\Controllers\\Api\\DashboardController.
 *
 * Both `statistics` and `charts-data` flow through the shared
 * dashboardService. The user-side controller passes teamMember=null;
 * the team-side variant passes the authenticated TeamMember so the
 * CORPORATE-role narrowing kicks in.
 */
export const dashboardController = {
  async statistics(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const query = req.query as unknown as StatisticsQuery;
    const statistics = await dashboardService.statistics(query, req.user, null);
    return res.status(200).json({
      success: true,
      message: "",
      code: "",
      data: { statistics },
    });
  },

  async chartsData(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const query = req.query as unknown as ChartsDataQuery;
    const data = await dashboardService.chartsData(query, req.user, null);
    return res.status(200).json({
      success: true,
      message: "",
      code: "",
      data,
    });
  },
};
