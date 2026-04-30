import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Secrets } from "../config/secrets";
import { logger } from "../helpers/logger";
import { ApiException } from "../helpers/errors";

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    rawBody?: Buffer;
  }
}

/**
 * Mirror of App\\Http\\Middleware\\VerifyFVBankSignature.
 *
 * FvBank signs each webhook payload with HMAC-SHA256 keyed on the
 * client_secret in the FvBank secret bundle. The signature is sent in
 * the `x-signature` header. We verify by HMACing the raw request body
 * (Buffer captured via express.json verify hook) and constant-time
 * comparing against the header value.
 *
 * Laravel reuses `client_secret` from the FvBank micro-service auth
 * bundle, which we keep mirrored under Secrets.external("fvbank").
 */
interface FvBankSecret {
  CLIENT_SECRET?: string;
}

export function fvbankWebhookSignature() {
  return async function (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const signature = req.header("x-signature");
      if (!signature) {
        logger.warn("FVBank Webhook: missing x-signature header");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const secret = await Secrets.external<FvBankSecret & Record<string, unknown>>(
        "fvbank",
      );
      if (!secret.CLIENT_SECRET) {
        logger.warn("FVBank Webhook: CLIENT_SECRET not configured in fvbank secret");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Prefer the captured raw body for byte-exact verification. If the
      // upstream verify hook didn't run (e.g. non-JSON content-type), fall
      // back to canonical JSON of the parsed body.
      const payload =
        req.rawBody && req.rawBody.length > 0
          ? req.rawBody
          : Buffer.from(JSON.stringify(req.body));

      const computed = crypto
        .createHmac("sha256", secret.CLIENT_SECRET)
        .update(payload)
        .digest("hex");

      if (
        computed.length !== signature.length ||
        !crypto.timingSafeEqual(
          Buffer.from(computed, "utf8"),
          Buffer.from(signature, "utf8"),
        )
      ) {
        logger.warn("FVBank Webhook: signature mismatch");
        next(new ApiException(181, undefined, 401));
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
