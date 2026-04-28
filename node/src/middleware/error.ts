import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiException, ValidationException } from "../helpers/errors";
import { logger } from "../helpers/logger";
import { sendError } from "../helpers/response";
import { env } from "../config/env";

/** Catch-all 404. */
export function notFound(_req: Request, res: Response): void {
  sendError(res, "Route not found.", 404, 404);
}

/**
 * Centralized error handler. Never leaks stack traces or internal messages
 * to clients in production. Always logs with the request id correlation.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const reqId = (req as Request & { id?: string }).id;

  if (err instanceof ValidationException) {
    logger.warn(
      { reqId, code: err.code, fieldErrors: err.fieldErrors },
      "Validation error",
    );
    res.status(422).json({
      status: false,
      code: 422,
      message: err.message,
      data: { errors: err.fieldErrors },
    });
    return;
  }

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_root";
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    logger.warn({ reqId, fieldErrors }, "Zod validation error");
    res.status(422).json({
      status: false,
      code: 422,
      message: "Validation error.",
      data: { errors: fieldErrors },
    });
    return;
  }

  if (err instanceof ApiException) {
    // Domain errors are already user-safe.
    logger.info(
      { reqId, code: err.code, httpStatus: err.httpStatus },
      err.message,
    );
    sendError(res, err.message, err.code, err.httpStatus);
    return;
  }

  // Unknown / programming error. Never expose details.
  logger.error({ reqId, err }, "Unhandled error");
  res.status(500).json({
    status: false,
    code: 500,
    message: "Internal server error.",
    data: env().APP_DEBUG && !env().NODE_ENV.startsWith("prod")
      ? { error: (err as Error).message }
      : null,
  });
}
