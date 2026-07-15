import { Request, Response } from "express";
import { Dispatch } from "../jobs";
import { callbackReceived } from "../services/telegram.service";

/**
 * Small inbound provider webhooks (mirror of the legacy
 * controllers/webhooks/{caliza,diginine,fvbank}WebhookController).
 *
 * All three always answer 200 — a non-2xx response would prompt the
 * provider to retry — and defer any heavy lifting to the shared queues
 * consumed by the legacy worker fleet.
 */

/**
 * POST /api/caliza-webhook
 * Mirror of CalizaWebhookController — acknowledges synchronously and
 * queues the payload for the ProcessCalizaWebhook worker.
 */
export const calizaWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const data = (req.body ?? {}) as Record<string, unknown>;
        // eslint-disable-next-line no-console
        console.info("Received Caliza Webhook:", JSON.stringify(data));
        void callbackReceived({ provider: "Caliza", payload: data });
        await Dispatch.calizaWebhook({ data });
        res.status(200).json({ status: "success" });
    } catch (webhookError) {
        res.handleError(webhookError);
    }
};

/**
 * POST /api/diginine-webhook
 * Mirror of DiginineWebhookController — acknowledges and queues the
 * forward for the ProcessDiginineWebhook worker.
 */
export const diginineWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const data = (req.body ?? {}) as Record<string, unknown>;
        // eslint-disable-next-line no-console
        console.info("Received Diginine Webhook:", JSON.stringify(data));
        await Dispatch.diginineWebhook({ data });
        res.status(200).json({ received: true });
    } catch (webhookError) {
        res.handleError(webhookError);
    }
};

/**
 * POST /api/ef-webhook
 * Mirror of FVBankWebhookController. Signature verification happens in
 * the upstream fvbank_webhook_signature middleware; once the request
 * reaches this handler the only behavior is logging + Telegram — the
 * actual deposit/account status updates flow through the FvBank
 * polling cron, since FvBank's webhook is informational only.
 */
export const fvbankWebhook = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const data = (req.body ?? {}) as Record<string, unknown>;
        void callbackReceived({ provider: "FVBank", payload: data });
        // eslint-disable-next-line no-console
        console.info("Received FV Bank Webhook:", JSON.stringify(data));
        res.status(200).json({ status: "success" });
    } catch (webhookError) {
        res.handleError(webhookError);
    }
};
