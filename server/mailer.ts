/**
 * Sends the Help-page "Report a problem" message straight to the developer's
 * inbox via SMTP (no email-app needed on the user's side).
 *
 * Configure in .env.local:
 *   SMTP_USER   - the Gmail address that sends the mail
 *   SMTP_PASS   - a Gmail APP PASSWORD (NOT your normal password — see .env.local)
 *   CONTACT_TO  - where messages land (defaults to SMTP_USER)
 *   SMTP_HOST   - default smtp.gmail.com
 *   SMTP_PORT   - default 465 (SSL)
 */
import nodemailer from "nodemailer";

function env(k: string): string | undefined {
  const v = process.env[k];
  return v ? v.trim() : undefined;
}

export function isMailConfigured(): boolean {
  return Boolean(env("SMTP_USER") && env("SMTP_PASS"));
}

let cached: nodemailer.Transporter | null = null;
function transporter(): nodemailer.Transporter {
  if (cached) return cached;
  const port = Number(env("SMTP_PORT") || 465);
  cached = nodemailer.createTransport({
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port,
    secure: port === 465, // true for 465, false for 587 (STARTTLS)
    // Gmail app passwords are shown with spaces for readability; strip them so
    // auth works whether the user pastes "abcd efgh ijkl mnop" or "abcdefghijklmnop".
    auth: { user: env("SMTP_USER")!, pass: (env("SMTP_PASS") || "").replace(/\s+/g, "") },
  });
  return cached;
}

/** Passwordless sign-in code. */
export async function sendLoginCodeEmail(args: {
  to: string;
  code: string;
  minutes: number;
}): Promise<void> {
  const from = env("SMTP_USER")!;
  await transporter().sendMail({
    from: `"JanamJyot" <${from}>`,
    to: args.to,
    subject: `${args.code} is your JanamJyot sign-in code`,
    text:
      `Your JanamJyot sign-in code is ${args.code}\n\n` +
      `It is valid for ${args.minutes} minutes. If you didn't try to sign in, ignore this email.\n\n— JanamJyot`,
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937;text-align:center">
         <h2 style="margin:0 0 6px;color:#111827">Your sign-in code</h2>
         <p style="margin:0 0 20px;color:#6b7280">Enter this code in the app to sign in.</p>
         <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#D97706;background:#FFF7ED;border-radius:14px;padding:18px 10px;margin:0 0 18px">${args.code}</div>
         <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Valid for ${args.minutes} minutes.</p>
         <p style="margin:0;font-size:13px;color:#6b7280">Didn't try to sign in? You can ignore this email.</p>
       </div>`,
  });
}

/** Password-reset link. Sent to the account owner only. */
export async function sendPasswordResetEmail(args: {
  to: string;
  name?: string | null;
  resetUrl: string;
  minutes: number;
}): Promise<void> {
  const from = env("SMTP_USER")!;
  const who = args.name?.trim() || "there";
  await transporter().sendMail({
    from: `"JanamJyot" <${from}>`,
    to: args.to,
    subject: "Reset your JanamJyot password",
    text:
      `Hi ${who},\n\n` +
      `We received a request to reset your JanamJyot password.\n` +
      `Open this link to choose a new one (valid for ${args.minutes} minutes):\n\n` +
      `${args.resetUrl}\n\n` +
      `If you didn't ask for this, you can safely ignore this email — your password stays unchanged.\n\n` +
      `— JanamJyot`,
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
         <h2 style="margin:0 0 6px;color:#111827">Reset your password</h2>
         <p style="margin:0 0 18px;color:#6b7280">Hi ${who}, we received a request to reset your JanamJyot password.</p>
         <p style="margin:0 0 22px">
           <a href="${args.resetUrl}" style="display:inline-block;background:#D97706;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:999px">Choose a new password</a>
         </p>
         <p style="margin:0 0 8px;font-size:13px;color:#6b7280">This link is valid for ${args.minutes} minutes.</p>
         <p style="margin:0;font-size:13px;color:#6b7280">If you didn't ask for this, ignore this email — your password stays unchanged.</p>
       </div>`,
  });
}

export async function sendContactEmail(args: {
  name: string;
  email: string;
  message: string;
}): Promise<void> {
  const to = env("CONTACT_TO") || env("SMTP_USER")!;
  const from = env("SMTP_USER")!;
  const safeName = args.name?.trim() || "A user";

  await transporter().sendMail({
    from: `"JanamJyot Help" <${from}>`,
    to,
    replyTo: args.email?.trim() || undefined, // reply goes to the user
    subject: `JanamJyot Support — message from ${safeName}`,
    text:
      `Name: ${safeName}\n` +
      `Reply email: ${args.email || "(not provided)"}\n\n` +
      `Message:\n${args.message}\n\n— Sent from the JanamJyot Help page`,
  });
}
