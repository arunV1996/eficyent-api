import nodemailer, { Transporter } from "nodemailer";

/**
 * Single shared nodemailer transport (mirror of the legacy mailer).
 * Mail is fire-and-forget — sendMail() never throws, so a transport
 * outage doesn't break user-facing flows.
 *
 * Configuration: MAIL_HOST, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD,
 * MAIL_FROM. When MAIL_HOST is unset the mailer is disabled (useful
 * for local testing — OTPs still land in the users table).
 */

let transporter: Transporter | null = null;

const getTransport = (): { transport: Transporter; from: string } | null => {
    const host = process.env.MAIL_HOST;
    const from = process.env.MAIL_FROM || "no-reply@eficyent.com";
    if (!host) {
        return null;
    }
    if (!transporter) {
        const port = parseInt(process.env.MAIL_PORT || "587", 10);
        transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: process.env.MAIL_USERNAME
                ? {
                      user: process.env.MAIL_USERNAME,
                      pass: process.env.MAIL_PASSWORD ?? "",
                  }
                : undefined,
        });
    }
    return { transport: transporter, from };
};

export interface MailMessage {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export const sendMail = async (message: MailMessage): Promise<boolean> => {
    const transport = getTransport();
    if (!transport) {
        // eslint-disable-next-line no-console
        console.warn(
            `Mailer disabled (MAIL_HOST unset) - skipped "${message.subject}" to ${message.to}`,
        );
        return false;
    }
    try {
        await transport.transport.sendMail({
            from: transport.from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text ?? message.html.replace(/<[^>]+>/g, ""),
        });
        return true;
    } catch (mailError) {
        // eslint-disable-next-line no-console
        console.error(
            `Mail send failed to ${message.to} ("${message.subject}"):`,
            mailError,
        );
        return false;
    }
};
