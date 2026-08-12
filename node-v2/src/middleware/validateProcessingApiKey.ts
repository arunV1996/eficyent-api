import { NextFunction, Request, Response } from "express";

/**
 * Middleware: ValidateProcessingApiKey
 * Checks X-API-KEY header against process.env.PROCESSING_EFICYENT_API_KEY.
 * Mirrors App\Http\Middleware\ValidateProcessingApiKey in Laravel.
 */
export const validateProcessingApiKey = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const headerKey = req.header("X-API-KEY");
    const expectedKey = process.env.PROCESSING_EFICYENT_API_KEY;

    if (!headerKey || !expectedKey || headerKey !== expectedKey) {
        res.status(401).json({
            success: false,
            message: "Unauthorized.",
        });
        return;
    }

    next();
};
