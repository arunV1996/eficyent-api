import { NextFunction, Request, Response } from "express";
import { User } from "@prisma/client";
import { ApiException } from "../helpers/errors";
import { tokenService } from "../services/auth/tokenService";

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    user?: User;
    tokenId?: bigint;
  }
}

const BEARER_RE = /^Bearer\s+(.+)$/i;

/**
 * Express equivalent of `auth:sanctum`.
 *
 *   - Reads the Authorization: Bearer <token> header
 *   - Verifies the opaque token against personal_access_tokens
 *   - Touches the Redis session (sliding inactivity TTL)
 *   - Attaches req.user and req.tokenId
 *
 * On failure: 401 with code 401, no detail leak.
 */
export async function authSanctum(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("authorization");
    if (!header) throw new ApiException(401, undefined, 401);
    const match = BEARER_RE.exec(header);
    if (!match) throw new ApiException(401, undefined, 401);

    const result = await tokenService.authenticate(match[1]!);
    if (!result) throw new ApiException(401, undefined, 401);

    req.user = result.user;
    req.tokenId = result.tokenId;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Equivalent of Laravel `email_should_be_verified` middleware.
 */
export function emailShouldBeVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) return next(new ApiException(401, undefined, 401));
  if (!req.user.emailVerifiedAt) {
    return next(new ApiException(403, "Email not verified.", 403));
  }
  next();
}
