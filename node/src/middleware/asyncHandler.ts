import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps async route handlers so thrown / rejected errors flow into Express's
 * error middleware instead of becoming unhandled rejections.
 */
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(
  fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return function (req, res, next) {
    Promise.resolve(fn(req as Req, res as Res, next)).catch(next);
  };
}
