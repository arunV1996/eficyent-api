import { NextFunction, Request, Response } from "express";
import multer from "multer";

/**
 * Global multipart/form-data parser (mirror of the legacy
 * `app.use(multer().any())`). Non-multipart requests pass through
 * untouched; multipart requests get their text fields parsed onto
 * req.body and any file parts onto req.files (memory storage), so
 * every endpoint accepts form-data exactly like raw JSON.
 *
 * `.any()` rather than `.none()` so multipart requests that carry a
 * file (the bulk-store uploads) parse here too instead of erroring
 * with LIMIT_UNEXPECTED_FILE.
 */
const formDataParser = multer();

export const formDataHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const contentType = req.headers["content-type"] || "";

    // If not multipart/form-data, skip.
    if (!contentType.includes("multipart/form-data")) {
        return next();
    }

    formDataParser.any()(req, res, next);
};
