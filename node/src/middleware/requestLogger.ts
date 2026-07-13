import { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs", "dailyLogs");

// Ensure dailyLogs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Custom stream that resolves the log filename dynamically by date
const dailyLogStream = {
  write: (message: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const filename = `${year}-${month}-${day}.log`;
    const logFilePath = path.join(LOGS_DIR, filename);
    fs.appendFileSync(logFilePath, message);
  },
};

// Sensitive fields to redact from logs
const SENSITIVE_FIELDS = [
  "password",
  "pin",
  "token",
  "apiKey",
  "saltKey",
  "privateKey",
  "old_password",
  "access_token",
  "client_secret",
];

function redactSensitiveData(data: any): any {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const redacted = { ...data };
  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object" && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }
  return redacted;
}

function tryParseJson(body: any): any {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

const morganMiddleware = morgan(
  (tokens, req: Request, res: Response) => {
    const payload = req.body && Object.keys(req.body).length > 0
      ? redactSensitiveData(req.body)
      : null;

    const methodFn = tokens.method;
    const urlFn = tokens.url;
    const statusFn = tokens.status;
    const responseTimeFn = tokens["response-time"];

    const status = statusFn ? Number(statusFn(req, res)) : res.statusCode;

    // Capture and process response body only if the status code is not 200
    const rawResponse = res.locals.responseBody;
    let responsePayload = null;

    if (status !== 200 && rawResponse !== undefined && rawResponse !== null) {
      if (Buffer.isBuffer(rawResponse)) {
        responsePayload = "[BINARY DATA]";
      } else {
        const parsed = tryParseJson(rawResponse);
        const redacted = redactSensitiveData(parsed);

        // Prevent disk bloating for extremely large payloads (e.g. exports)
        const serialized = typeof redacted === "string" ? redacted : JSON.stringify(redacted);
        if (serialized.length > 20000) {
          responsePayload = "[TRUNCATED - Response payload too large]";
        } else {
          responsePayload = redacted;
        }
      }
    }

    // Get logged-in user or team member email
    const reqAny = req as any;
    let userEmail = reqAny.user?.email || reqAny.teamMember?.email || null;

    // Fallback to request payload for signature-less APIs (e.g. login, register)
    if (!userEmail && req.body && typeof req.body.email === "string") {
      userEmail = req.body.email.trim();
    }

    const logObj = {
      time: new Date().toString(),
      user_email: userEmail,
      method: methodFn ? methodFn(req, res) : req.method,
      url: urlFn ? urlFn(req, res) : req.originalUrl || req.url,
      payload,
      response: responsePayload,
      error: res.locals.error || null,
      status,
      responseTime: responseTimeFn ? `${responseTimeFn(req, res)} ms` : "-",
    };

    return JSON.stringify(logObj, null, 2) + "\n";
  },
  { stream: dailyLogStream },
);

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const originalSend = res.send;
  const originalJson = res.json;

  res.send = function (body) {
    if (res.locals && !res.locals.responseBody) {
      res.locals.responseBody = body;
    }
    return originalSend.apply(this, arguments as any);
  };

  res.json = function (body) {
    if (res.locals) {
      res.locals.responseBody = body;
    }
    return originalJson.apply(this, arguments as any);
  };

  morganMiddleware(req, res, next);
};

