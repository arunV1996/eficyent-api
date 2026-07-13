import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

/**
 * Checks for validation errors in request.
 * If errors are found, sends a response with the first error message and code.
 */
export const checkValidationErrors = async (req: Request, res: Response,next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = errors.array()[0];
        const { msg, code } =
            typeof error.msg === "object"
                ? error.msg
                : { msg: error.msg, code: 1000 };
        return res.sendError(msg, code);
    }
    next();
};
