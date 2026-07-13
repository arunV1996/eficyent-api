import { NextFunction, Request, Response } from "express";

/**
 * Response envelope emitted by every endpoint. Matches the shape
 * produced by node/src/helpers/response.ts so the API contract stays
 * identical during the migration:
 *
 *   {
 *     "status": true | false,
 *     "code":   <numeric code, e.g. 104>,
 *     "message": "...",
 *     "data":    <object | array | null>
 *   }
 */

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Response {
            sendResponse: (
                data: unknown,
                message: string,
                code: number,
                httpStatus?: number,
            ) => void;
            sendError: (
                message: string,
                code: number,
                httpStatus?: number,
            ) => void;
            handleError: (error: unknown) => void;
        }
    }
}

/**
 * Registers `sendResponse`, `sendError`, and `handleError` on the
 * Response object for every request. Must be mounted before the
 * routes so that controllers can call them.
 */
export const responseHelpers = (
    _req: Request,
    res: Response,
    next: NextFunction,
): void => {
    res.sendResponse = (
        data: unknown,
        message: string,
        code: number,
        httpStatus = 200,
    ): void => {
        res.status(httpStatus).json({
            status: true,
            code,
            message,
            data: data ?? null,
        });
    };

    res.sendError = (
        message: string,
        code: number,
        httpStatus = 400,
    ): void => {
        res.status(httpStatus).json({
            status: false,
            code,
            message,
            data: null,
        });
    };

    res.handleError = (error: unknown): void => {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Unhandled controller error:", error);
        res.status(500).json({
            status: false,
            code: 500,
            message:
                process.env.NODE_ENV === "production"
                    ? "An unexpected error occurred."
                    : errorMessage,
            data: null,
        });
    };

    next();
};
