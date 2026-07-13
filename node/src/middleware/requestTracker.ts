import { Request, Response, NextFunction } from "express";
import { activeRequests, notifyUnresolvedRequests } from "../services/external/slackAlertService";

// Whitelist of critical endpoints that must be tracked for success
const TARGET_ROUTES = [
  { method: "POST", path: "/api/user/deposits/store" },
  { method: "POST", path: "/api/user/beneficiary-transactions/store" },
  { method: "POST", path: "/api/user/login" },
];

export const requestTracker = (req: Request, res: Response, next: NextFunction) => {
  const pathWithoutQuery = req.originalUrl.split("?")[0];
  const isTarget = TARGET_ROUTES.some(
    (route) => route.method === req.method && pathWithoutQuery === route.path,
  );

  if (!isTarget) {
    return next();
  }

  const reqId = (req as any).id || Math.random().toString(36).substring(7);

  const pending = {
    id: reqId,
    method: req.method,
    url: req.originalUrl,
    startTime: Date.now(),
    payload: req.body,
    req,
  };

  activeRequests.set(reqId, pending);

  // 1. Successful finish: remove from registry
  res.on("finish", () => {
    activeRequests.delete(reqId);
  });

  // 2. Connection closed/aborted prematurely without headers sent
  res.on("close", () => {
    if (!res.headersSent) {
      const active = activeRequests.get(reqId);
      if (active) {
        // Send Slack alert asynchronously for client abort/timeout
        void notifyUnresolvedRequests([active], "Client Abort / Timeout");
        activeRequests.delete(reqId);
      }
    }
  });

  next();
};
