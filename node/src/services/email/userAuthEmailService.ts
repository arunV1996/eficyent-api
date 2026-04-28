import { User } from "@prisma/client";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Services\\Email\\UserAuthEmailService. The actual transport
 * (SES / Mailgun) is wired up when the Mail subsystem is converted; this
 * preserves the call signature so controllers can be ported now.
 *
 * For now: log + no-op. Replace `transport.send(...)` with the real provider
 * once the mail service is in place.
 */
export const UserAuthEmailService = {
  async registered(user: User): Promise<void> {
    logger.info(
      { userId: user.id.toString(), to: user.email, template: "registered" },
      "Auth email queued (placeholder)",
    );
    // TODO: enqueue mail job through BullMQ once mail service is ported.
  },

  async forgotPassword(user: User): Promise<void> {
    logger.info(
      { userId: user.id.toString(), to: user.email, template: "forgot_password" },
      "Auth email queued (placeholder)",
    );
  },
};
