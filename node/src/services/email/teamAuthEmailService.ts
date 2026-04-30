import { TeamMember } from "@prisma/client";
import { sendMail } from "./mailer";
import { settingGet } from "../settings/settingsService";
import { forgotPasswordEmail } from "./templates";
import { env } from "../../config/env";
import { logger } from "../../helpers/logger";

/**
 * Mirror of App\\Services\\Email\\TeamAuthEmailService.
 *
 * Reuses the existing user-side templates (the visual identity is
 * intentionally identical for the team-member experience). For
 * team-specific templates in the future, add new builders to
 * email/templates.ts and resolve them here.
 */

async function brand(): Promise<string> {
  return (await settingGet<string>("site_name", env().APP_NAME)) || env().APP_NAME;
}

export const TeamAuthEmailService = {
  async forgotPassword(member: TeamMember & { emailCode?: string | null }): Promise<void> {
    try {
      const tpl = forgotPasswordEmail({
        brand: await brand(),
        firstName: member.name,
        email: member.email,
        emailCode: member.emailCode ?? null,
      });
      await sendMail({ to: member.email, ...tpl });
    } catch (err) {
      logger.error({ err, memberId: member.id.toString() }, "team forgot-password mail failed");
    }
  },
};
