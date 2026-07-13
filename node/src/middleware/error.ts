import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiException, ValidationException } from "../helpers/errors";
import { logger } from "../helpers/logger";
import { sendError } from "../helpers/response";
import { env } from "../config/env";
import { notifyRequestError } from "../services/external/slackAlertService";

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

  if (res.locals) {
    res.locals.error = {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // Whitelist of critical endpoints that must alert Slack on failure
  const TARGET_ROUTES = [
    { method: "POST", path: "/api/user/deposits/store" },
    { method: "POST", path: "/api/user/beneficiary-transactions/store" },
    { method: "POST", path: "/api/user/login" },
  ];
  const pathWithoutQuery = req.originalUrl.split("?")[0];
  const isTarget = TARGET_ROUTES.some(
    (route) => route.method === req.method && pathWithoutQuery === route.path,
  );
  if (isTarget) {
    void notifyRequestError(req, err, "Route Catch Block");
  }

  if (err instanceof ValidationException) {
    logger.warn(
      { reqId, code: err.code, fieldErrors: err.fieldErrors },
      "Validation error",
    );
    const firstField = Object.keys(err.fieldErrors)[0];
    let firstError = firstField && err.fieldErrors[firstField]
      ? err.fieldErrors[firstField][0]
      : err.message;
    if (firstError === "Required" && firstField) {
      firstError = `${firstField} is required`;
    }
    res.status(422).json({
      success: false,
      error: firstError,
      error_code: 422,
    });
    return;
  }

  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    let errorMessage = firstIssue ? firstIssue.message : "Validation error.";
    if (firstIssue && firstIssue.message === "Required" && firstIssue.path.length > 0) {
      errorMessage = `${firstIssue.path.join(".")} is required`;
    }
    logger.warn({ reqId, issues: err.issues }, "Zod validation error");
    res.status(422).json({
      success: false,
      error: errorMessage,
      error_code: 422,
    });
    return;
  }

  if (err instanceof ApiException) {
    logger.info(
      { reqId, code: err.code, httpStatus: err.httpStatus },
      err.message,
    );
    res.status(err.httpStatus).json({
      success: false,
      error: err.message,
      error_code: err.code,
    });
    return;
  }

  // Unknown / programming error. Never expose details.
  logger.error({ reqId, err }, "Unhandled error");
  res.status(500).json({
    status: false,
    code: 500,
    message: "Something went wrong.",
    data: env().APP_DEBUG && !env().NODE_ENV.startsWith("prod")
      ? { error: (err as Error).message }
      : null,
  });
}
