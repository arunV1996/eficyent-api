/**
 * Mirror of Laravel App\\Mail\\User\\* and corresponding blade templates.
 *
 * Templates kept as inline string builders rather than a templating
 * engine - they're small, change rarely, and the per-render cost is a
 * few microseconds. Each builder returns { subject, html }; the caller
 * passes it to sendMail() with the recipient.
 *
 * Brand name comes from settings.site_name; pass it in or rely on the
 * caller's resolution.
 */

interface Branded {
  brand: string;
}

function shell(brand: string, body: string): string {
  return `<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#333;max-width:560px;margin:24px auto;padding:24px;border:1px solid #e3e3e3;border-radius:8px">
<h1 style="font-size:20px;color:#222">${escapeHtml(brand)}</h1>
${body}
<hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
<p style="color:#888;font-size:12px">This is an automated message from ${escapeHtml(brand)}. Do not reply.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface UserContext extends Branded {
  firstName: string | null;
  email: string;
  emailCode?: string | null;
}

export function registeredEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>Welcome to <b>${escapeHtml(ctx.brand)}</b>. To finish setting up your account please verify your email address using this code:</p>
<p style="font-size:24px;letter-spacing:6px;font-weight:bold;text-align:center;background:#f5f5f5;padding:16px;border-radius:6px">${escapeHtml(ctx.emailCode ?? "")}</p>
<p>This code expires in 10 minutes.</p>`;
  return {
    subject: `Verify your email - ${ctx.brand}`,
    html: shell(ctx.brand, body),
  };
}

export function verifyEmailAddressEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>Here is your verification code:</p>
<p style="font-size:24px;letter-spacing:6px;font-weight:bold;text-align:center;background:#f5f5f5;padding:16px;border-radius:6px">${escapeHtml(ctx.emailCode ?? "")}</p>
<p>This code expires in 10 minutes. If you didn't request it, ignore this message.</p>`;
  return {
    subject: `Your verification code - ${ctx.brand}`,
    html: shell(ctx.brand, body),
  };
}

export function emailVerifiedEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>Your email address has been verified successfully. You can now sign in and start using <b>${escapeHtml(ctx.brand)}</b>.</p>`;
  return {
    subject: `Email verified - ${ctx.brand}`,
    html: shell(ctx.brand, body),
  };
}

export function forgotPasswordEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>We received a request to reset your password. Use the verification code below to continue:</p>
<p style="font-size:24px;letter-spacing:6px;font-weight:bold;text-align:center;background:#f5f5f5;padding:16px;border-radius:6px">${escapeHtml(ctx.emailCode ?? "")}</p>
<p>This code expires in 10 minutes. If you didn't request a password reset you can safely ignore this email.</p>`;
  return {
    subject: `Reset your password - ${ctx.brand}`,
    html: shell(ctx.brand, body),
  };
}

interface InviteContext extends Branded {
  firstName: string | null;
  inviteUrl: string;
  expiresInMinutes: number;
}

export function userInviteLinkEmail(ctx: InviteContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>You've been invited to join <b>${escapeHtml(ctx.brand)}</b>. Click the button below to set your password and finish creating your account.</p>
<p style="text-align:center;margin:24px 0"><a href="${escapeHtml(ctx.inviteUrl)}" style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Accept invitation</a></p>
<p style="color:#666;font-size:13px">This link expires in ${ctx.expiresInMinutes} minutes. If the button doesn't work, paste this URL into your browser: <br/>${escapeHtml(ctx.inviteUrl)}</p>`;
  return {
    subject: `Invitation to join ${ctx.brand}`,
    html: shell(ctx.brand, body),
  };
}
