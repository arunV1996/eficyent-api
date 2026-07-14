import { Request, Response } from "express";
import StaticPage from "../models/static_page.model";
import { formatDateHuman } from "../utils/common.utils";
import { ACTIVE } from "../utils/constants";

/**
 * Mirror of StaticPageController (via the legacy
 * staticPagesController). Field set and order match Laravel's
 * StaticPageResource: {unique_id, title, content, type, status,
 * created_at} — the title is capitalized, `content` carries the
 * description column.
 */

const shape = (
    row: StaticPage,
    timezone?: string,
): Record<string, unknown> => {
    return {
        unique_id: row.uniqueId,
        title: row.title
            ? row.title.charAt(0).toUpperCase() + row.title.slice(1)
            : "",
        content: row.description,
        type: row.type,
        status: row.status,
        created_at: row.createdAt
            ? formatDateHuman(row.createdAt, timezone)
            : "",
    };
};

/**
 * GET /api/user/static-pages/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        const rows = await StaticPage.findAll({
            where: { status: ACTIVE },
            order: [["id", "ASC"]],
        });
        const timezone = req.user?.timezone || "Asia/Kolkata";
        return res.sendResponse(
            {
                total: rows.length,
                static_pages: rows.map((row) => shape(row, timezone)),
            },
            "",
            200,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/static-pages/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        const query = req.query as Record<string, string | undefined>;
        const where: Record<string, unknown> = { status: ACTIVE };
        if (query.type) {
            where.type = query.type;
        }
        if (query.static_page_unique_id) {
            where.uniqueId = query.static_page_unique_id;
        }
        const row = await StaticPage.findOne({ where });
        if (!row) {
            return res.sendError("Static page not found.", 164, 400);
        }
        const timezone = req.user?.timezone || "Asia/Kolkata";
        return res.sendResponse(
            { static_page: shape(row, timezone) },
            "",
            200,
        );
    } catch (error) {
        return res.handleError(error);
    }
};
