import { Request, Response } from "express";
import { logger } from "../../helpers/logger";
import { Dispatch } from "../../queues/dispatchers";
import { TelegramNotifier } from "../../services/external/telegram";

/**
 * Mirror of App\\Http\\Controllers\\Api\\Callbacks\\CalizaWebhookController.
 *
 * Always returns 200 - any non-2xx would prompt Caliza to retry, so we
 * acknowledge synchronously and dispatch the heavy lifting to a queue.
 */
export const calizaWebhookController = {
  async invoke(req: Request, res: Response): Promise<Response> {
    const data = (req.body ?? {}) as Record<string, unknown>;
    logger.info({ data }, "Received Caliza Webhook");
    void TelegramNotifier.callbackReceived({ provider: "Caliza", payload: data });
    await Dispatch.calizaWebhook({ data });
    return res.status(200).json({ status: "success" });
  },
};
