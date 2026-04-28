import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { sendResponse } from "../../helpers/response";

/**
 * Mirror of Api\\SettingsController. Returns the public-facing application
 * settings consumed by the frontend on bootstrap.
 *
 * Allowed keys are deliberately whitelisted; never expose all rows in the
 * settings table - many of them are internal (compliance toggles, fee
 * defaults, etc.) and exfiltrating them aids attackers.
 */
const ALLOWED_KEYS = [
  "site_name",
  "site_icon",
  "site_logo",
  "inactivity_in_seconds",
];

export const settingsController = {
  async getAppSettings(_req: Request, res: Response): Promise<Response> {
    const rows = await prisma().setting.findMany({
      where: { key: { in: ALLOWED_KEYS } },
      select: { key: true, value: true },
    });
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return sendResponse(res, "", 200, { settings });
  },
};
