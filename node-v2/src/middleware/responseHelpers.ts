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
            /**
             * `code` is numeric for most endpoints, but the legacy
             * lookups group returns an empty-string code with message
             * "OK" — the string type is kept so that contract survives.
             */
            sendResponse: (
                data: unknown,
                message: string,
                code: number | string,
                httpStatus?: number,
            ) => void;
            sendError: (
                message: string,
                code: number,
                httpStatus?: number,
            ) => void;
            handleError: (error: unknown) => void;
            /**
             * Legacy profile-style envelope preserved for endpoints that
             * historically returned `{ success, message, code: "", data }`
             * (see node/src/controllers/profile/profileController.ts's
             * emptyEnvelope helper). The frontend depends on this shape.
             */
            sendEmptyEnvelope: (
                data: Record<string, unknown>,
                message: string,
            ) => void;
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
        code: number | string,
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
        // Legacy error contract: the /node error middleware serializes
        // every ApiException / validation failure as
        // {success: false, error, error_code} — NOT the success
        // envelope's {status, code, message, data} shape.
        res.status(httpStatus).json({
            success: false,
            error: message,
            error_code: code,
        });
    };

    res.sendEmptyEnvelope = (
        data: Record<string, unknown>,
        message: string,
    ): void => {
        res.status(200).json({
            success: true,
            message,
            code: "",
            data,
        });
    };

    res.handleError = (error: unknown): void => {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Unhandled controller error:", error);
        // Mirror of the legacy unknown-error branch: 500 with
        // "Something went wrong." and no detail leak in production.
        res.status(500).json({
            status: false,
            code: 500,
            message: "Something went wrong.",
            data:
                process.env.NODE_ENV === "production"
                    ? null
                    : { error: errorMessage },
        });
    };

    next();
};
