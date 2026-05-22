import compression from "compression";
import cors from "cors";
import { NextFunction, Request, RequestHandler, Response } from "express";
import helmet from "helmet";
import { env } from "../config/env";

// Augment Express Response so callers can call res.extendTimeout(ms)
declare global {
  namespace Express {
    interface Response {
      extendTimeout?: (ms: number) => void;
    }
  }
}

/**
 * Security baseline applied globally. Order of application matters:
 *   1. helmet  - response headers (CSP, HSTS, X-Frame-Options, etc.)
 *   2. cors    - explicit allowlist; never `*`
 *   3. body limits, JSON parsing - applied in index.ts after this stack
 */

export function helmetMiddleware(): RequestHandler {
  return helmet({
    // Public API; CSP is for any HTML responses (errors, healthchecks).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    hidePoweredBy: true,
    noSniff: true,
    frameguard: { action: "deny" },
    hsts: {
      maxAge: 60 * 60 * 24 * 365,
      includeSubDomains: true,
      preload: true,
    },
  });
}

export function corsMiddleware(): RequestHandler {
  const origins = env()
    .CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin, cb) => {
      // Allow same-origin / non-browser requests (no Origin header).
      if (!origin) return cb(null, true);
      if (origins.length === 0) return cb(new Error("CORS not configured"));
      return cb(null, origins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
      "X-Merchant-Id",
      "X-Merchant-Signature",
      "Idempotency-Key",
      "X-Api-Key",
      "X-Api-Timestamp",
      "X-Api-Signature",
      "X-Api-Language",
      "X-Api-Device-Id",
    ],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });
}

export function compressionMiddleware(): RequestHandler {
  return compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  });
}

/**
 * Reject obviously oversized bodies before express.json() even parses.
 * The Content-Length header is advisory but cheap to check; the JSON parser
 * still enforces its own `limit` as a backstop.
 */
export function bodySizeGuard(): RequestHandler {
  const limitBytes = env().REQUEST_BODY_LIMIT_KB * 1024;
  return function (req: Request, res: Response, next: NextFunction): void {
    const len = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(len) && len > limitBytes) {
      res.status(413).json({
        status: false,
        code: 413,
        message: "Request body too large.",
        data: null,
      });
      return;
    }
    next();
  };
}

/**
 * Slowloris guard. Express does not enforce socket-level idle/header timeouts
 * by default; we set them on `server` in index.ts. This middleware is a soft
 * per-request timeout.
 */
export function requestTimeout(ms: number): RequestHandler {
  return function (_req: Request, res: Response, next: NextFunction): void {
    let t: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          status: false,
          code: 504,
          message: "Request timeout.",
          data: null,
        });
      }
    }, ms);

    const clear = () => {
      if (t) { clearTimeout(t); t = null; }
    };

    // Allow individual handlers to bump the deadline for known long operations.
    res.extendTimeout = (newMs: number) => {
      clear();
      t = setTimeout(() => {
        if (!res.headersSent) {
          res.status(504).json({
            status: false,
            code: 504,
            message: "Request timeout.",
            data: null,
          });
        }
      }, newMs);
    };

    res.on("finish", clear);
    res.on("close", clear);
    next();
  };
}
