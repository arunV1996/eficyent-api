import { NextFunction, Request, RequestHandler, Response } from "express";
import fs from "fs";
import morgan from "morgan";
import path from "path";
import { createStream } from "rotating-file-stream";

/**
 * Morgan-based request/response logging.
 *
 * Two loggers share the same core fields (endpoint, payload, response
 * time, status, timestamp):
 *   - terminalRequestLogger writes them to the console (replacing the
 *     old Sequelize query spam, which is now disabled).
 *   - fileRequestLogger additionally records the caller's email and the
 *     response body, and writes one JSON line per request to a daily
 *     log file (logs/YYYY-MM-DD.log) at the project root, outside src/.
 */

// __dirname is src/middleware (ts-node) or dist/middleware (build), so
// two levels up lands on the project root in both cases.
const logsDirectory = path.join(__dirname, "..", "..", "logs");
fs.mkdirSync(logsDirectory, { recursive: true });

const formatLogDate = (value: Date): string => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

// Daily rotation; the active file and every rotated file are both named
// after their calendar date so the directory reads YYYY-MM-DD.log.
const dailyLogStream = createStream(
    (time) => `${formatLogDate(time ? new Date(time) : new Date())}.log`,
    {
        interval: "1d",
        path: logsDirectory,
    },
);

// Never write credentials or signing material into log files.
const SENSITIVE_KEY_PATTERN = /password|token|secret|signature|otp|pin/i;
const MAX_LOGGED_RESPONSE_LENGTH = 10000;

const sanitizePayload = (value: unknown, depth = 0): unknown => {
    if (depth > 4 || value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizePayload(entry, depth + 1));
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
            ? "[REDACTED]"
            : sanitizePayload(entry, depth + 1);
    }
    return sanitized;
};

const stringifyForLog = (value: unknown): string => {
    if (value === undefined) {
        return "-";
    }
    if (Buffer.isBuffer(value)) {
        return `<binary ${value.length} bytes>`;
    }
    const serialized =
        typeof value === "string" ? value : JSON.stringify(value) ?? "-";
    if (serialized.length > MAX_LOGGED_RESPONSE_LENGTH) {
        return `${serialized.slice(0, MAX_LOGGED_RESPONSE_LENGTH)}...[truncated]`;
    }
    return serialized;
};

/**
 * Response interceptor: wraps res.send/res.json so the body handed to
 * the client is retained on res.locals for the file logger (morgan runs
 * its formatter on the response "finish" event, after auth and the
 * controller have populated req.user and sent the body).
 */
export const responseBodyCapture = (
    _request: Request,
    response: Response,
    next: NextFunction,
): void => {
    const originalSend = response.send.bind(response);
    response.send = ((body?: unknown) => {
        response.locals.loggedResponseBody = body;
        return originalSend(body as never);
    }) as Response["send"];
    next();
};

morgan.token("endpoint", (req: Request) => req.originalUrl || req.url);
morgan.token("payload", (req: Request) =>
    stringifyForLog(sanitizePayload(req.body)),
);
morgan.token("timestamp", () => new Date().toISOString());
morgan.token(
    "user-email",
    (req: Request) => req.teamMember?.email || req.user?.email || "-",
);
morgan.token("response-body", (_req: Request, res: Response) =>
    stringifyForLog(res.locals.loggedResponseBody),
);

/**
 * Terminal logger: endpoint, payload, response time, status, timestamp.
 */
export const terminalRequestLogger: RequestHandler = morgan(
    ":timestamp :method :endpoint :status :response-time ms payload=:payload",
);

/**
 * Daily file logger: everything the terminal logger records, plus the
 * caller's email and the response body, as one JSON object per line.
 */
export const fileRequestLogger: RequestHandler = morgan(
    (tokens, req, res) =>
        JSON.stringify({
            endpoint: tokens["endpoint"](req, res),
            payload: tokens["payload"](req, res),
            response_time_ms: Number(tokens["response-time"](req, res)) || 0,
            status: Number(tokens["status"](req, res)) || 0,
            timestamp: tokens["timestamp"](req, res),
            user_email: tokens["user-email"](req, res),
            response: tokens["response-body"](req, res),
        }),
    { stream: dailyLogStream },
);
