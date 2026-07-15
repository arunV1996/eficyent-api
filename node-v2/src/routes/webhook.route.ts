import { Router } from "express";
import { complianceWebhook } from "../controller/compliance_webhook.controller";
import { processingUnitWebhook } from "../controller/processing_unit_webhook.controller";
import {
    calizaWebhook,
    diginineWebhook,
    fvbankWebhook,
} from "../controller/webhook.controller";
import { webhookApiRoutes } from "../utils/api.routes";

/**
 * Inbound provider webhook routes (mirror of the legacy
 * routes/webhooks.routes.ts). Mounted at the API root — external
 * providers expect the exact paths already registered with their
 * dashboards:
 *
 *   POST /api/caliza-webhook
 *   POST /api/diginine-webhook
 *   POST /api/ef-webhook                   (FvBank, signature-verified)
 *   POST /api/compliance/webhook-callback
 *   POST /api/processingunit-webhook
 *
 * No `/user` prefix — these endpoints are unauthenticated and receive
 * provider traffic directly (signature verification handles authn
 * where applicable). Handlers answer 200 even on internal failure so
 * providers do not retry-storm.
 */
const webhookRouter = Router();

webhookRouter.post(
    webhookApiRoutes.CALIZA.path,
    ...webhookApiRoutes.CALIZA.middleware,
    calizaWebhook,
);

webhookRouter.post(
    webhookApiRoutes.DIGININE.path,
    ...webhookApiRoutes.DIGININE.middleware,
    diginineWebhook,
);

webhookRouter.post(
    webhookApiRoutes.FVBANK.path,
    ...webhookApiRoutes.FVBANK.middleware,
    fvbankWebhook,
);

webhookRouter.post(
    webhookApiRoutes.COMPLIANCE.path,
    ...webhookApiRoutes.COMPLIANCE.middleware,
    complianceWebhook,
);

webhookRouter.post(
    webhookApiRoutes.PROCESSING_UNIT.path,
    ...webhookApiRoutes.PROCESSING_UNIT.middleware,
    processingUnitWebhook,
);

export default webhookRouter;
