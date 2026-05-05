import { Request, Response } from "express";
import { logger } from "../../helpers/logger";
import { Dispatch } from "../../queues/dispatchers";

/**
 * Mirror of App\\Http\\Controllers\\Api\\Callbacks\\DiginineWebhookController.
 *
 * Acknowledges 200 and queues the forward.
 */
export const diginineWebhookController = {
  async invoke(req: Request, res: Response): Promise<Response> {
    const data = (req.body ?? {}) as Record<string, unknown>;
    logger.info({ data }, "Received Diginine Webhook");
    await Dispatch.diginineWebhook({ data });
    return res.status(200).json({ received: true });
  },
};
