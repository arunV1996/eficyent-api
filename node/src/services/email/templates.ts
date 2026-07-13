/**
 * Mirror of Laravel App\\Mail\\User\\* and corresponding blade templates.
 *
 * Brand name comes from settings.site_name; pass it in or rely on the
 * caller's resolution.
 */

interface Branded {
  brand: string;
}

interface UserContext extends Branded {
  firstName: string | null;
  email: string;
  emailCode?: string | null;
}

interface InviteContext extends Branded {
  firstName: string | null;
  inviteUrl: string;
  expiresInMinutes: number;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Original simple layout used for registration, reset password, verified notification, and invites */
function plainShell(brand: string, body: string): string {
  return `<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#333;max-width:560px;margin:24px auto;padding:24px;border:1px solid #e3e3e3;border-radius:8px">
<h1 style="font-size:20px;color:#222">${escapeHtml(brand)}</h1>
${body}
<hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
<p style="color:#888;font-size:12px">This is an automated message from ${escapeHtml(brand)}. Do not reply.</p>
</body></html>`;
}

/* Premium HTML layout used exclusively for OTP Verify */
function premiumShell(brand: string, title: string, bodyText: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(title)} - ${escapeHtml(brand)}</title>
    <style>
        /* Core Dark Mode Overrides */
        @media (prefers-color-scheme: dark) {
            body, .body-table {
                background-color: #1a1a1a !important;
                color: #e0e0e0 !important;
            }
            .content-box {
                background-color: #2d2d2d !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
            }
            .top-note, .footer-text, .footer-text a {
                color: #a0a0a0 !important;
            }
            h1, h3, strong {
                color: #ffffff !important;
            }
            .body-text, .desc-text {
                color: #cccccc !important;
            }
            .cta-box {
                background-color: #3d3d3d !important;
            }
            .cta-link, .inline-link {
                color: #6495ed !important;
            }
            .separator {
                border-top: 1px solid #444444 !important;
            }
        }

        /* Responsive Mobile Layout Overrides */
        @media screen and (max-width: 600px) {
            .container {
                width: 100% !important;
                max-width: 100% !important;
                padding: 10px !important;
            }
            .content-box {
                padding: 24px !important;
            }
            .hero-img {
                width: 100% !important;
                height: auto !important;
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

    <table class="body-table" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f8; padding: 20px 0;">
        <tr>
            <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="width: 600px; margin: 0 auto; max-width: 600px;">
                    
                    <tr>
                        <td class="top-note" align="center" style="font-size: 12px; color: #666666; line-height: 18px; padding-bottom: 20px; text-align: center; font-weight: 400;">
                            Verify your account credentials for ${escapeHtml(brand)}.
                        </td>
                    </tr>

                    <tr>
                        <td class="content-box" style="background-color: #ffffff; padding: 40px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                
                                <tr>
                                    <td>
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="left">
                                                    <img src="https://app.eficyent.com/img/logo.png" alt="${escapeHtml(brand)}" width="180" style="display: block; border: 0; max-width: 180px;">
                                                </td>
                                                <td align="right" style="vertical-align: middle;">
                                                    <a class="footer-text" href="https://app.eficyent.com" style="color: #999999; font-size: 14px; text-decoration: none;">Launch ${escapeHtml(brand)}</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <tr>
                                    <td align="center" style="padding: 40px 0 20px 0;">
                                        <img class="hero-img" src="https://eficyent.com/assets/images/global-card-issuance.webp" alt="Global Card Issuance" width="380" style="display: block; max-width: 100%; height: auto; border: 0; mix-blend-mode: multiply;">
                                    </td>
                                </tr>

                                <tr>
                                    <td align="left" style="padding-bottom: 15px;">
                                        <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #111111; line-height: 32px;">
                                            ${escapeHtml(title)}
                                        </h1>
                                    </td>
                                </tr>

                                <tr>
                                    <td class="body-text" align="left" style="font-size: 15px; color: #444444; line-height: 24px; padding-bottom: 25px;">
                                        ${bodyText}
                                    </td>
                                </tr>

                                <tr>
                                    <td align="center" style="padding-bottom: 30px;">
                                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td class="cta-box" align="center" style="background-color: #f7f9fc; padding: 16px; border-radius: 4px; text-align: center;">
                                                    <span class="cta-link" style="color: #316fea; font-size: 28px; font-weight: 700; letter-spacing: 6px; text-decoration: none; word-break: break-all;">
                                                       ${escapeHtml(otpCode)}
                                                    </span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>

                                <tr>
                                    <td class="separator" style="border-top: 1px solid #eeeeee; padding-top: 25px;"></td>
                                </tr>

                                <tr>
                                    <td align="left" style="padding-bottom: 10px;">
                                        <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #111111;">Not sure what ${escapeHtml(brand)} is?</h3>
                                    </td>
                                </tr>
                                
                                <tr>
                                    <td class="desc-text" align="left" style="font-size: 14px; color: #555555; line-height: 22px; padding-bottom: 15px;">
                                        ${escapeHtml(brand)} is a global payment and card issuance platform designed to make business finances simple, fast, and secure.
                                    </td>
                                </tr>
                                
                                <tr>
                                    <td align="left" style="font-size: 14px; line-height: 22px;">
                                        <a class="inline-link" href="https://eficyent.com" style="color: #316fea; text-decoration: none;">Learn how ${escapeHtml(brand)} can help you and your team make global business communication and finance <span style="text-decoration: underline;">less stressful and more productive</span>.</a>
                                    </td>
                                </tr>

                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td class="footer-text" align="center" style="padding: 30px 20px; font-size: 12px; color: #888888; line-height: 20px; text-align: center;">
                            Stay in touch with your team from anywhere. <a class="inline-link" href="https://app.eficyent.com" style="color: #316fea; text-decoration: none;">Download the apps</a>
                            <div style="margin-top: 15px; margin-bottom: 15px;">
                                <a class="inline-link" href="https://eficyent.com" style="color: #316fea; text-decoration: none; margin: 0 8px;">Website</a> | 
                                <a class="inline-link" href="https://twitter.com/eficyent" style="color: #316fea; text-decoration: none; margin: 0 8px;">Twitter</a> | 
                                <a class="inline-link" href="https://eficyent.com" style="color: #316fea; text-decoration: none; margin: 0 8px;">Help Center</a>
                            </div>
                            <a class="footer-text" href="https://app.eficyent.com/unsubscribe" style="color: #888888; text-decoration: underline;">Unsubscribe from ${escapeHtml(brand)} updates</a>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>`;
}

/* Premium Twist-based template used for verify email during registration */
export function registeredEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const bodyText = `
    ${greeting}<br/><br/>
    Welcome to <b>${escapeHtml(ctx.brand)}</b>. To finish setting up your account please verify your email address using this code:
  `;
  return {
    subject: `Verify your email - ${ctx.brand}`,
    html: premiumShell(ctx.brand, `Verify your email`, bodyText, ctx.emailCode ?? ""),
  };
}

/* Premium Twist-based template used for OTP Verify */
export function verifyEmailAddressEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const bodyText = `
    ${greeting}<br/><br/>
    Here is your verification code to verify your email address:
  `;
  return {
    subject: `Your verification code - ${ctx.brand}`,
    html: premiumShell(ctx.brand, `Your verification code`, bodyText, ctx.emailCode ?? ""),
  };
}

/* Original simple template for verified email notification */
export function emailVerifiedEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>Your email address has been verified successfully. You can now sign in and start using <b>${escapeHtml(ctx.brand)}</b>.</p>`;
  return {
    subject: `Email verified - ${ctx.brand}`,
    html: plainShell(ctx.brand, body),
  };
}

/* Premium Twist-based template used for forgot password OTP */
export function forgotPasswordEmail(ctx: UserContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const bodyText = `
    ${greeting}<br/><br/>
    We received a request to reset your password. Use the verification code below to continue:
  `;
  return {
    subject: `Reset your password - ${ctx.brand}`,
    html: premiumShell(ctx.brand, `Reset your password`, bodyText, ctx.emailCode ?? ""),
  };
}

/* Original simple template for user invite links */
export function userInviteLinkEmail(ctx: InviteContext): { subject: string; html: string } {
  const greeting = ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "Hello,";
  const body = `
<p>${greeting}</p>
<p>You've been invited to join <b>${escapeHtml(ctx.brand)}</b>. Click the button below to set your password and finish creating your account.</p>
<p style="text-align:center;margin:24px 0"><a href="${escapeHtml(ctx.inviteUrl)}" style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Accept invitation</a></p>
<p style="color:#666;font-size:13px">This link expires in ${ctx.expiresInMinutes} minutes. If the button doesn't work, paste this URL into your browser: <br/>${escapeHtml(ctx.inviteUrl)}</p>`;
  return {
    subject: `Invitation to join ${ctx.brand}`,
    html: plainShell(ctx.brand, body),
  };
}
