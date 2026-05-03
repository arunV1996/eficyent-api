import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  complianceAlignController,
  remittanceAlignController,
} from "../controllers/align/alignControllers";

/**
 * Mirror of:
 *   POST /compliance/align
 *   POST /stable-coin-remittance/align
 *
 * Both endpoints are public (no auth) in Laravel and just enqueue
 * their respective batch jobs. We preserve the exact path + method.
 *
 * Operators triggering these by curl from a private network is the
 * intended use case; deploy these endpoints behind WAF / IP allowlist.
 */
export function alignRoutes(): Router {
  const r = Router();
  r.post(
    "/compliance/align",
    asyncHandler(complianceAlignController.invoke),
  );
  r.post(
    "/stable-coin-remittance/align",
    asyncHandler(remittanceAlignController.invoke),
  );
  return r;
}
