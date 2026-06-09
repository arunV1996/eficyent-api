import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { fvbankWebhookSignature } from "../middleware/fvbankWebhookSignature";
import { calizaWebhookController } from "../controllers/webhooks/calizaWebhookController";
import { diginineWebhookController } from "../controllers/webhooks/diginineWebhookController";
import { fvbankWebhookController } from "../controllers/webhooks/fvbankWebhookController";
import { complianceWebhookController } from "../controllers/webhooks/complianceWebhookController";
import { processingUnitWebhookController } from "../controllers/webhooks/processingUnitWebhookController";

/**
 * Inbound webhook routes (Phase 9). Mounted at the API root to mirror
 * Laravel's flat routing - external providers expect the exact paths
 * already registered with their dashboards.
 *
 *   POST /caliza-webhook
 *   POST /diginine-webhook
 *   POST /ef-webhook                   (FvBank, signature-verified)
 *   POST /compliance/webhook-callback
 *   POST /processingunit-webhook
 *
 * No `/api/user` prefix - these endpoints are unauthenticated and
 * receive provider traffic directly (signature verification handles
 * authn where applicable).
 */
export function webhookRoutes(): Router {
  const r = Router();

  r.post("/caliza-webhook", asyncHandler(calizaWebhookController.invoke));
  r.post("/diginine-webhook", asyncHandler(diginineWebhookController.invoke));
  r.post(
    "/ef-webhook",
    fvbankWebhookSignature(),
    asyncHandler(fvbankWebhookController.invoke),
  );
  r.post(
    "/compliance/webhook-callback",
    asyncHandler(complianceWebhookController.invoke),
  );
  r.post(
    "/processingunit-webhook",
    asyncHandler(processingUnitWebhookController.invoke),
  );

  return r;
}
