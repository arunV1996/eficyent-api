import { User } from "@prisma/client";
import { logger } from "../../helpers/logger";
import { prisma } from "../../db/prisma";
import { generateEmailCode } from "../../helpers/uniqueId";
import { generateEmailCodeExpiry } from "../../helpers/lookups";
import { sendMail } from "./mailer";
import { settingGet } from "../settings/settingsService";
import {
  emailVerifiedEmail,
  forgotPasswordEmail,
  registeredEmail,
  userInviteLinkEmail,
  verifyEmailAddressEmail,
} from "./templates";
import { env } from "../../config/env";

/**
 * Mirror of App\\Services\\Email\\UserAuthEmailService.
 *
 * Each method:
 *   1. Mutates the user row when needed (email_code refresh).
 *   2. Renders the matching template with the brand from settings.
 *   3. Dispatches via nodemailer; failures are logged but never thrown.
 */

async function brand(): Promise<string> {
  return (await settingGet<string>("site_name", env().APP_NAME)) || env().APP_NAME;
}

export const UserAuthEmailService = {
  async registered(user: User): Promise<void> {
    const code = generateEmailCode();
    await prisma().user.update({
      where: { id: user.id },
      data: { emailCode: code, emailCodeExpiry: generateEmailCodeExpiry(10) },
    });
    const tpl = registeredEmail({
      brand: await brand(),
      firstName: user.firstName,
      email: user.email,
      emailCode: code,
    });
    await sendMail({ to: user.email, ...tpl });
  },

  async forgotPassword(user: User): Promise<void> {
    // forgotPasswordController already wrote a fresh email_code on the
    // user row before calling us; re-read to ensure we send the
    // right one without burning a second code.
    const refreshed = await prisma().user.findUnique({ where: { id: user.id } });
    const tpl = forgotPasswordEmail({
      brand: await brand(),
      firstName: user.firstName,
      email: user.email,
      emailCode: refreshed?.emailCode ?? null,
    });
    await sendMail({ to: user.email, ...tpl });
  },

  async emailVerified(user: User): Promise<void> {
    const tpl = emailVerifiedEmail({
      brand: await brand(),
      firstName: user.firstName,
      email: user.email,
    });
    await sendMail({ to: user.email, ...tpl });
  },

  async emailVerificationCode(user: User): Promise<void> {
    const code = generateEmailCode();
    await prisma().user.update({
      where: { id: user.id },
      data: { emailCode: code, emailCodeExpiry: generateEmailCodeExpiry(10) },
    });
    const tpl = verifyEmailAddressEmail({
      brand: await brand(),
      firstName: user.firstName,
      email: user.email,
      emailCode: code,
    });
    await sendMail({ to: user.email, ...tpl });
  },
};

/**
 * Subuser-specific transactional emails. The encrypted invite token
 * goes into a URL the email recipient can click; the URL fragment is
 * configurable via the invite_url_template setting (default points at
 * the frontend SPA).
 */
export const UserEmailService = {
  async userInviteLink(user: User, encryptedToken: string): Promise<void> {
    const template = await settingGet<string>(
      "invite_url_template",
      `${env().APP_URL.replace(/\/$/, "")}/accept-invite?token={token}`,
    );
    const url = template.replace("{token}", encodeURIComponent(encryptedToken));
    const expiresMin = Number(
      await settingGet<string>("invite_link_expiry", "60"),
    );
    const tpl = userInviteLinkEmail({
      brand: await brand(),
      firstName: user.firstName,
      inviteUrl: url,
      expiresInMinutes: Number.isFinite(expiresMin) ? expiresMin : 60,
    });
    const ok = await sendMail({ to: user.email, ...tpl });
    logger.info(
      { userId: user.id.toString(), to: user.email, ok },
      "Subuser invite dispatched",
    );
  },
};
