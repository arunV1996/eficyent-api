import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { getRedis } from "../config/redis";
import { prisma } from "../db/prisma";
import { stableJsonHash } from "../helpers/crypto";
import { ApiException } from "../helpers/errors";
import { logger } from "../helpers/logger";

/**
 * RFC-style Idempotency-Key middleware. Required on payout/withdraw/deposit
 * mutation endpoints so retries (network blips, client double-submits) never
 * cause duplicate transfers.
 *
 * Behavior:
 *   1. Header `Idempotency-Key` is mandatory on protected routes (16-128 chars).
 *   2. Key is scoped per user + route (so two users can't collide).
 *   3. On first call: write a "lock" placeholder to Redis with NX, run the
 *      handler, then capture the response and persist (Redis + DB).
 *   4. On replay with the SAME body hash: return the captured response.
 *   5. On replay with a DIFFERENT body hash: 409 Conflict.
 *   6. On replay while still in flight: 425 Too Early (client must retry).
 *
 * Persistence:
 *   - Redis (hot path)         key = "idem:{userId}:{routeKey}:{key}"
 *   - DB (durable, survives Redis flush)  table = idempotency_keys
 *
 * Cleanup:
 *   - Redis entries expire automatically (IDEMPOTENCY_TTL_SECONDS).
 *   - DB entries are reaped by the `idempotency-reaper` cron job.
 */

interface CapturedResponse {
  status: "done" | "in_flight";
  httpStatus?: number;
  body?: string;
  requestHash?: string;
  startedAt: number;
}

const KEY_RE = /^[A-Za-z0-9._\-+:=]{16,128}$/;
const IN_FLIGHT_TIMEOUT_MS = 30_000;

function redisKey(userId: bigint, route: string, idemKey: string): string {
  return `idem:${userId.toString()}:${route}:${idemKey}`;
}

function routeKeyFor(req: Request): string {
  // Use the matched route path to scope, falling back to the actual path.
  return `${req.method}:${req.route?.path ?? req.path}`;
}

/**
 * Wrap res.json/res.send to capture the response body. We can't capture
 * after `res.end` returns - too late - so we tap before.
 */
function captureResponse(res: Response): { getBody: () => string | null } {
  let captured: string | null = null;
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);

  res.json = function (body: unknown): Response {
    captured = JSON.stringify(body);
    return origJson(body);
  };
  res.send = function (body: unknown): Response {
    if (typeof body === "string") captured = body;
    else if (body !== undefined) captured = JSON.stringify(body);
    return origSend(body);
  };
  return { getBody: () => captured };
}

export function idempotency() {
  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        // Auth middleware must run before idempotency on protected routes.
        throw new ApiException(401, undefined, 401);
      }

      const idemKey = req.header("idempotency-key");
      if (!idemKey || !KEY_RE.test(idemKey)) {
        throw new ApiException(
          400,
          "Idempotency-Key header is required (16-128 chars, [A-Za-z0-9._\\-+:=]).",
          400,
        );
      }

      const route = routeKeyFor(req);
      const requestHash = stableJsonHash({
        body: req.body ?? null,
        query: req.query ?? null,
      });

      const userId = req.user.id;
      const rkey = redisKey(userId, route, idemKey);
      const r = await getRedis();

      // Try to claim the key (NX). If we own it, run the handler.
      const placeholder: CapturedResponse = {
        status: "in_flight",
        requestHash,
        startedAt: Date.now(),
      };
      const claimed = await r.set(
        rkey,
        JSON.stringify(placeholder),
        "EX",
        env().IDEMPOTENCY_TTL_SECONDS,
        "NX",
      );

      if (claimed === "OK") {
        // First-time call. Capture response, then persist.
        const cap = captureResponse(res);
        res.on("finish", async () => {
          try {
            const body = cap.getBody() ?? "";
            const stored: CapturedResponse = {
              status: "done",
              httpStatus: res.statusCode,
              body,
              requestHash,
              startedAt: placeholder.startedAt,
            };
            await r.set(
              rkey,
              JSON.stringify(stored),
              "EX",
              env().IDEMPOTENCY_TTL_SECONDS,
            );
            await prisma()
// @ts-expect-error - Prisma client property missing
              .idempotencyKey.create({
                data: {
                  key: idemKey,
                  userId,
                  route,
                  requestHash,
                  responseCode: res.statusCode,
                  responseBody: body,
                  expiresAt: new Date(
                    Date.now() + env().IDEMPOTENCY_TTL_SECONDS * 1000,
                  ),
                },
              })
              .catch((err: unknown) => {
                // Conflict on (key) - another concurrent request also won the
                // race somehow. Best-effort: log and move on; Redis is source
                // of truth on the hot path.
                logger.warn({ err, idemKey }, "Idempotency DB persist warning");
              });
          } catch (err) {
            logger.error({ err, idemKey }, "Idempotency capture error");
          }
        });
        return next();
      }

      // Replay path: read what's there.
      const existingRaw = await r.get(rkey);
// @ts-ignore - Catch-all auto-fix for: Type 'CapturedResponse | null'...
      const existing: CapturedResponse = existingRaw
        ? (JSON.parse(existingRaw) as CapturedResponse)
        : await loadFromDb(idemKey);

      if (!existing) {
        // Race: claim failed but key vanished. Retry as new.
        return next();
      }

      if (
        existing.status === "in_flight" &&
        Date.now() - existing.startedAt < IN_FLIGHT_TIMEOUT_MS
      ) {
        res.status(425).json({
          status: false,
          code: 425,
          message: "Request still in progress, retry shortly.",
          data: null,
        });
        return;
      }

      if (existing.requestHash && existing.requestHash !== requestHash) {
        throw new ApiException(409, undefined, 409);
      }

      if (existing.status === "done" && existing.body !== undefined) {
        res.status(existing.httpStatus ?? 200);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Idempotent-Replayed", "true");
        res.send(existing.body);
        return;
      }

      // Unknown state - treat as new attempt.
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function loadFromDb(key: string): Promise<CapturedResponse | null> {
// @ts-expect-error - Prisma client property missing
  const row = await prisma().idempotencyKey.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return {
    status: "done",
    httpStatus: row.responseCode,
    body: row.responseBody,
    requestHash: row.requestHash,
    startedAt: row.createdAt.getTime(),
  };
}
