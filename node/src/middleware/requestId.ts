import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

const HEADER = "x-request-id";

/**
 * Adopts the upstream request id (from ALB / CloudFront / API gateway) when
 * present and well-formed; otherwise mints a UUIDv4. The id is propagated on
 * the response and attached to req for downstream logging.
 */
export function requestId() {
  return function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADER);
    const id =
      incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID();
    (req as Request & { id: string }).id = id;
    res.setHeader(HEADER, id);
    next();
  };
}
