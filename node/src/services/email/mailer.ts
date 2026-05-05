import nodemailer, { Transporter } from "nodemailer";
import { Secrets } from "../../config/secrets";
import { logger } from "../../helpers/logger";

/**
 * Single shared nodemailer transport. Connection details come from the
 * `eficyent/<env>/mail` Secrets Manager bundle (already declared in
 * Phase 1's Secrets.mail() loader). Supports any SMTP-capable backend:
 * Amazon SES via SMTP credentials is the production default.
 *
 * Mail is fire-and-forget from controllers - sendMail() never throws,
 * so a transport outage doesn't break user-facing flows. SOC auditors
 * can correlate via the structured log line.
 */

let transporter: Transporter | null = null;
let fromAddress: string | null = null;

async function getTransport(): Promise<{
  transport: Transporter;
  from: string;
} | null> {
  if (transporter && fromAddress) {
    return { transport: transporter, from: fromAddress };
  }
  try {
    const secret = await Secrets.mail();
    transporter = nodemailer.createTransport({
      host: secret.host,
      port: secret.port,
      secure: secret.port === 465,
      auth: secret.username
        ? { user: secret.username, pass: secret.password ?? "" }
        : undefined,
    });
    fromAddress = secret.from;
    return { transport: transporter, from: fromAddress };
  } catch (err) {
    logger.warn({ err }, "Mail secret unavailable - mailer disabled");
    return null;
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send a single email. Best-effort - returns whether the message was
 * dispatched. Caller should not branch on the return value (downstream
 * flows must be tolerant of mail failures).
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const t = await getTransport();
  if (!t) return false;
  try {
    await t.transport.sendMail({
      from: t.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text ?? msg.html.replace(/<[^>]+>/g, ""),
    });
    logger.info({ to: msg.to, subject: msg.subject }, "Mail sent");
    return true;
  } catch (err) {
    logger.error({ err, to: msg.to, subject: msg.subject }, "Mail send failed");
    return false;
  }
}
