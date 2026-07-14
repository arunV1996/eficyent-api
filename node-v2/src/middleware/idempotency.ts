import { NextFunction, Request, Response } from "express";
import { getRedis } from "../config/redis";
import { stableJsonHash } from "../helpers/crypto.helper";

/**
 * Idempotency-Key middleware for the money-moving endpoints (payout
 * store / cancel / update-status). Mirror of the legacy
 * middleware/idempotency.ts:
 *
 *   1. The `Idempotency-Key` header is optional — requests without it
 *      pass straight through.
 *   2. Keys are scoped per user + route, so users can't collide.
 *   3. First call claims the key in Redis (NX), runs the handler and
 *      persists the captured response for the TTL.
 *   4. Replays with the SAME body hash return the captured response
 *      (with the `Idempotent-Replayed: true` header).
 *   5. Replays with a DIFFERENT body hash get 409 Conflict.
 *   6. Replays while the first call is still in flight get 425.
 *
 * The legacy service also had a DB persistence layer behind a
 * `prisma().idempotencyKey` feature check — the model never existed in
 * the schema, so it was a runtime no-op. Redis is the store here, same
 * as legacy behavior in production.
 */

interface CapturedResponse {
    status: "done" | "in_flight";
    httpStatus?: number;
    body?: string;
    requestHash?: string;
    startedAt: number;
}

const KEY_PATTERN = /^[A-Za-z0-9._\-+:=]{16,128}$/;
const IN_FLIGHT_TIMEOUT_MS = 30_000;

const idempotencyTtlSeconds = (): number => {
    const configured = Number(process.env.IDEMPOTENCY_TTL_SECONDS);
    return Number.isFinite(configured) && configured > 0 ? configured : 86_400;
};

const redisKey = (userId: number, route: string, idemKey: string): string => {
    return `idem:${userId}:${route}:${idemKey}`;
};

const routeKeyFor = (req: Request): string => {
    return `${req.method}:${req.route?.path ?? req.path}`;
};

/**
 * Wraps res.json/res.send to capture the response body before it is
 * flushed — after `res.end` it would be too late.
 */
const captureResponse = (res: Response): { getBody: () => string | null } => {
    let captured: string | null = null;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function capturedJson(responseBody: unknown): Response {
        captured = JSON.stringify(responseBody);
        return originalJson(responseBody);
    };
    res.send = function capturedSend(responseBody: unknown): Response {
        if (typeof responseBody === "string") {
            captured = responseBody;
        } else if (responseBody !== undefined) {
            captured = JSON.stringify(responseBody);
        }
        return originalSend(responseBody);
    };
    return { getBody: () => captured };
};

export const idempotency = () => {
    return async function idempotencyMiddleware(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            if (!req.user) {
                // Auth middleware must run before idempotency.
                return res.sendError(res.__("401"), 401, 401);
            }

            const idemKey = req.header("idempotency-key");
            if (!idemKey) {
                return next();
            }

            if (!KEY_PATTERN.test(idemKey)) {
                return res.sendError(
                    "Idempotency-Key header format is invalid (16-128 chars, [A-Za-z0-9._\\-+:=]).",
                    400,
                    400,
                );
            }

            const route = routeKeyFor(req);
            const requestHash = stableJsonHash({
                body: req.body ?? null,
                query: req.query ?? null,
            });

            const storageKey = redisKey(req.user.id, route, idemKey);
            const redis = getRedis();
            const ttlSeconds = idempotencyTtlSeconds();

            // Try to claim the key (NX). If we own it, run the handler.
            const placeholder: CapturedResponse = {
                status: "in_flight",
                requestHash,
                startedAt: Date.now(),
            };
            const claimed = await redis.set(
                storageKey,
                JSON.stringify(placeholder),
                "EX",
                ttlSeconds,
                "NX",
            );

            if (claimed === "OK") {
                // First-time call. Capture the response, then persist.
                const capture = captureResponse(res);
                res.on("finish", async () => {
                    try {
                        const stored: CapturedResponse = {
                            status: "done",
                            httpStatus: res.statusCode,
                            body: capture.getBody() ?? "",
                            requestHash,
                            startedAt: placeholder.startedAt,
                        };
                        await redis.set(
                            storageKey,
                            JSON.stringify(stored),
                            "EX",
                            ttlSeconds,
                        );
                    } catch (error) {
                        // eslint-disable-next-line no-console
                        console.error("Idempotency capture error:", error);
                    }
                });
                return next();
            }

            // Replay path: read what's there.
            const existingRaw = await redis.get(storageKey);
            const existing: CapturedResponse | null = existingRaw
                ? (JSON.parse(existingRaw) as CapturedResponse)
                : null;

            if (!existing) {
                // Race: claim failed but the key vanished. Retry as new.
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
                return res.sendError(
                    "Idempotency key conflict: a different request was already processed under this key.",
                    409,
                    409,
                );
            }

            if (existing.status === "done" && existing.body !== undefined) {
                res.status(existing.httpStatus ?? 200);
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Idempotent-Replayed", "true");
                res.send(existing.body);
                return;
            }

            // Unknown state — treat as a new attempt.
            next();
        } catch (error) {
            res.handleError(error);
        }
    };
};
