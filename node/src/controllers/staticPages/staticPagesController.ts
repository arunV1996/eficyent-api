import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { ApiException } from "../../helpers/errors";
import { sendResponse } from "../../helpers/response";
import { ACTIVE } from "../../helpers/constants";
import { StaticPageShowInput } from "../../validators/staticPages/staticPagesValidators";

/**
 * Mirror of StaticPageController. Returns active static pages.
 * Field set / order matches Laravel's StaticPageResource:
 *   { unique_id, title, description, type, footer_section, status }
 */

interface StaticPageDto {
  unique_id: string;
  title: string;
  description: string;
  type: string;
  footer_section: number;
  status: number;
}

function shape(row: {
  uniqueId: string;
  title: string;
  description: string;
  type: string;
  footerSection: number;
  status: number;
}): StaticPageDto {
  return {
    unique_id: row.uniqueId,
    title: row.title,
    description: row.description,
    type: row.type,
    footer_section: row.footerSection,
    status: row.status,
  };
}

export const staticPagesController = {
  async index(_req: Request, res: Response): Promise<Response> {
    const rows = await prisma().staticPage.findMany({
      where: { status: ACTIVE },
      orderBy: { id: "asc" },
    });
    return sendResponse(res, "", 200, {
      total: rows.length,
      static_pages: rows.map(shape),
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
    return sendResponse(res, "", 200, { static_page: shape(row) });
  },
};
