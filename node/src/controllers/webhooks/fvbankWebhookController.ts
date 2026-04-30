import { Request, Response } from "express";
import { logger } from "../../helpers/logger";
import { TelegramNotifier } from "../../services/external/telegram";

/**
 * Mirror of App\\Http\\Controllers\\Api\\Callbacks\\FVBankWebhookController.
 *
 * Signature verification happens in the upstream
 * `fvbankWebhookSignature` middleware. Once the request reaches us, we
 * have a valid FvBank-signed payload and the only Laravel-equivalent
 * behavior is logging + Telegram. The actual deposit/account status
 * updates flow via the FvBank polling cron (FetchFvBankVirtualAccountsJob)
 * since FvBank's webhook is intentionally informational only.
 */
export const fvbankWebhookController = {
  async invoke(req: Request, res: Response): Promise<Response> {
    const data = (req.body ?? {}) as Record<string, unknown>;
    void TelegramNotifier.callbackReceived({ provider: "FVBank", payload: data });
    logger.info({ data }, "Received FV Bank Webhook");
    return res.status(200).json({ status: "success" });
  },
};
