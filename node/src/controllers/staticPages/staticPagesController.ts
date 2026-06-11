import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { ACTIVE } from "../../helpers/constants";
import { StaticPageShowInput } from "../../validators/staticPages/staticPagesValidators";
import { formatDate } from "../../helpers/lookups";

/**
 * Mirror of StaticPageController. Returns active static pages.
 * Field set / order matches Laravel's StaticPageResource:
 *   { unique_id, title, content, type, status, created_at }
 */

interface StaticPageDto {
  unique_id: string;
  title: string;
  content: string;
  type: string;
  status: number;
  created_at: string;
}

function shape(
  row: {
    uniqueId: string;
    title: string;
    description: string;
    type: string;
    status: number;
    createdAt: Date | null;
  },
  timezone?: string,
): StaticPageDto {
  return {
    unique_id: row.uniqueId,
    title: row.title ? row.title.charAt(0).toUpperCase() + row.title.slice(1) : "",
    content: row.description,
    type: row.type,
    status: row.status,
    created_at: row.createdAt ? formatDate(row.createdAt, timezone) : "",
  };
}

export const staticPagesController = {
  async index(req: Request, res: Response): Promise<Response> {
    const rows = await prisma().staticPage.findMany({
      where: { status: ACTIVE },
      orderBy: { id: "asc" },
    });
    const timezone = req.user?.timezone || "Asia/Kolkata";
    return sendResponse(res, "", 200, {
      total: rows.length,
      static_pages: rows.map((row) => shape(row, timezone)),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    const q = req.query as unknown as StaticPageShowInput;
    const row = await prisma().staticPage.findFirst({
// @ts-ignore - Catch-all auto-fix for: Type '{ uniqueId?: string | un...
      where: {
        status: ACTIVE,
        ...(q.type ? { type: q.type } : {}),
        ...(q.static_page_unique_id ? { uniqueId: q.static_page_unique_id } : {}),
      },
    });
    if (!row) throw new ApiException(164);
    const timezone = req.user?.timezone || "Asia/Kolkata";
    return sendResponse(res, "", 200, { static_page: shape(row, timezone) });
  },
};
