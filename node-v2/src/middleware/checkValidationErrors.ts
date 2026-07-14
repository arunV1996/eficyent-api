import { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";

/**
 * Emits a standard 400 sendError envelope when the express-validator
 * pipeline for a route finds any issue. Only the first error is
 * surfaced so the client sees the same one-error-per-response shape
 * that the legacy /node validator middleware produced.
 */
export const checkValidationErrors = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const validationErrors = validationResult(req);

    if (validationErrors.isEmpty()) {
        return next();
    }

    const firstError = validationErrors.array()[0];
    const errorPayload =
        typeof firstError.msg === "object" && firstError.msg !== null
            ? (firstError.msg as { msg: string; code: number })
            : { msg: String(firstError.msg), code: 422 };

    // Legacy validation contract: every validation failure surfaces as
    // HTTP 422 with error_code 422 (the message identifies the field).
    res.sendError(errorPayload.msg, 422, 422);
};
