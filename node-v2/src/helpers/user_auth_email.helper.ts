import User from "../models/user.model";
import { sendMail } from "../services/mailer.service";
import {
    emailVerifiedEmail,
    forgotPasswordEmail,
    registeredEmail,
    userInviteLinkEmail,
    verifyEmailAddressEmail,
} from "./email_templates.helper";
import { settingGet } from "./setting.helper";
import {
    generateEmailCodeExpiry,
} from "../utils/common.utils";
import { randomBytes } from "crypto";

/**
 * Mirror of App\Services\Email\UserAuthEmailService. Each method
 * refreshes the user's email_code when needed, renders the matching
 * template with the brand from settings, and dispatches best-effort.
 */

/** Six random digits (mirror of generateEmailCode). */
export const generateEmailCode = (): string => {
    return String(100_000 + (randomBytes(4).readUInt32BE(0) % 900_000));
};

const brand = async (): Promise<string> => {
    const appName = process.env.APP_NAME || "Eficyent";
    return (await settingGet<string>("site_name", appName)) || appName;
};

export const UserAuthEmail = {
    async registered(user: User): Promise<void> {
        const code = generateEmailCode();
        await user.update({
            emailCode: code,
            emailCodeExpiry: generateEmailCodeExpiry(10),
        });
        const template = registeredEmail({
            brand: await brand(),
            firstName: user.firstName,
            email: user.email,
            emailCode: code,
        });
        await sendMail({ to: user.email, ...template });
    },

    async forgotPassword(user: User): Promise<void> {
        // The controller already wrote a fresh email_code before calling
        // us; re-read so we send that one without burning a second code.
        const refreshed = await User.unscoped().findByPk(user.id);
        const template = forgotPasswordEmail({
            brand: await brand(),
            firstName: user.firstName,
            email: user.email,
            emailCode: refreshed?.emailCode ?? null,
        });
        await sendMail({ to: user.email, ...template });
    },

    async emailVerified(user: User): Promise<void> {
        const template = emailVerifiedEmail({
            brand: await brand(),
            firstName: user.firstName,
            email: user.email,
        });
        await sendMail({ to: user.email, ...template });
    },

    /**
     * Subuser invitation (mirror of UserEmailService.userInviteLink):
     * the invite URL template comes from settings with an APP_URL
     * fallback, `{token}` is substituted with the encrypted envelope.
     */
    async userInviteLink(user: User, encryptedToken: string): Promise<void> {
        const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
        const template = await settingGet<string>(
            "invite_url_template",
            `${appUrl}/accept-invite?token={token}`,
        );
        const url = template.replace(
            "{token}",
            encodeURIComponent(encryptedToken),
        );
        const expiresMinutes = Number(
            await settingGet<string>("invite_link_expiry", "60"),
        );
        const mailTemplate = userInviteLinkEmail({
            brand: await brand(),
            firstName: user.firstName,
            inviteUrl: url,
            expiresInMinutes: Number.isFinite(expiresMinutes)
                ? expiresMinutes
                : 60,
        });
        await sendMail({ to: user.email, ...mailTemplate });
    },

    async emailVerificationCode(user: User): Promise<void> {
        const code = generateEmailCode();
        await user.update({
            emailCode: code,
            emailCodeExpiry: generateEmailCodeExpiry(10),
        });
        const template = verifyEmailAddressEmail({
            brand: await brand(),
            firstName: user.firstName,
            email: user.email,
            emailCode: code,
        });
        await sendMail({ to: user.email, ...template });
    },
};
