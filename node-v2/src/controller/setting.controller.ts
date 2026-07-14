import { Request, Response } from "express";
import { Op } from "sequelize";
import Setting from "../models/setting.model";

/**
 * Mirror of Api\SettingsController — the public application settings
 * consumed by the frontend on bootstrap.
 *
 * Keys are deliberately whitelisted: most settings rows are internal
 * (compliance toggles, fee defaults) and must never be exposed.
 */

const ALLOWED_KEYS = [
    "site_name",
    "site_icon",
    "site_logo",
    "inactivity_in_seconds",
];

/**
 * GET /api/user/get_settings
 */
export const getAppSettings = async (
    _req: Request,
    res: Response,
): Promise<void> => {
    try {
        const rows = await Setting.findAll({
            where: { key: { [Op.in]: ALLOWED_KEYS } },
            attributes: ["key", "value"],
        });
        const settings: Record<string, string> = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return res.sendResponse({ settings }, "", 200);
    } catch (error) {
        return res.handleError(error);
    }
};
