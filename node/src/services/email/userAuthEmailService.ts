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

  async emailVerified(user: User): Promise<void> {
    logger.info(
      { userId: user.id.toString(), to: user.email, template: "email_verified" },
      "Auth email queued (placeholder)",
    );
  },

  async emailVerificationCode(user: User): Promise<void> {
    // Mirror of Laravel UserAuthEmailService::email_verification_code -
    // refresh the user's email_code + email_code_expiry and dispatch the
    // mail. The actual mail send is wired up when the Mail subsystem
    // is ported.
    const { prisma } = await import("../../db/prisma");
    const { generateEmailCode } = await import("../../helpers/uniqueId");
    const { generateEmailCodeExpiry } = await import("../../helpers/lookups");

    await prisma().user.update({
      where: { id: user.id },
      data: {
        emailCode: generateEmailCode(),
        emailCodeExpiry: generateEmailCodeExpiry(10),
      },
    });
    logger.info(
      { userId: user.id.toString(), to: user.email, template: "email_verification_code" },
      "Auth email queued (placeholder)",
    );
  },
};

/**
 * Subuser-specific transactional emails - thin wrapper around the same
 * placeholder transport for now. Will share the underlying queue when the
 * Mail module is built.
 */
export const UserEmailService = {
  async userInviteLink(user: User, encryptedToken: string): Promise<void> {
    logger.info(
      {
        userId: user.id.toString(),
        to: user.email,
        template: "user_invite_link",
        tokenPreview: encryptedToken.slice(0, 12),
      },
      "Subuser invite email queued (placeholder)",
    );
  },
};
