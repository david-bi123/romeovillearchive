import { absoluteUrl } from "@/lib/env";
import { ROLE_LABELS } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";

/**
 * Branded HTML + plain text email templates.
 *
 * Every template renders both an HTML and a text part, states its purpose,
 * shows an expiry notice when a link is time limited, and builds the link from
 * APP_BASE_URL only.
 */

const BRAND = {
  name: "RomeoVille Records",
  company: "RomeoVille Properties",
  subtitle: "Document & Indenture Management System",
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type LayoutOptions = {
  preheader: string;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  notice?: string;
  signature?: string;
};

function renderLayout({ preheader, heading, paragraphs, ctaLabel, ctaUrl, notice, signature }: LayoutOptions): {
  html: string;
  text: string;
} {
  const textLines = [
    preheader,
    "",
    heading,
    "",
    ...paragraphs,
    "",
    ...(ctaLabel && ctaUrl ? [`${ctaLabel}: ${ctaUrl}`, ""] : []),
    ...(notice ? [`Please note: ${notice}`, ""] : []),
    `— ${signature ?? `${BRAND.name} · ${BRAND.company}`}`,
    "",
    `${BRAND.name} — ${BRAND.subtitle}`,
  ];

  const htmlParagraphs = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const cta =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
           <tr>
             <td align="center" bgcolor="#0f5132" style="border-radius:6px">
               <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(ctaLabel)}</a>
             </td>
           </tr>
         </table>`
      : "";
  const noticeHtml = notice
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f6f7f6;border-left:3px solid #8a9a8a;border-radius:4px">
           <tr><td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#3f4a42">${escapeHtml(notice)}</td></tr>
         </table>`
    : "";
  const urlLine = ctaLabel && ctaUrl
    ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#5c6660">If the button does not work, copy and paste this link into your browser:<br><a href="${escapeHtml(ctaUrl)}" style="color:#0f5132;word-break:break-all">${escapeHtml(ctaUrl)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f2;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e3e6e2;border-radius:8px">
        <tr>
          <td style="padding:24px 32px 8px 32px;border-bottom:1px solid #eef0ed">
            <div style="font-size:17px;font-weight:700;color:#0f5132;letter-spacing:-0.2px">${escapeHtml(BRAND.name)}</div>
            <div style="font-size:12px;color:#7b8480;margin-top:2px">${escapeHtml(BRAND.subtitle)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px 32px">
            <h1 style="margin:0 0 20px 0;font-size:20px;line-height:1.4;color:#1b211d;font-weight:700">${escapeHtml(heading)}</h1>
            ${htmlParagraphs}
            ${cta}
            ${urlLine}
            ${noticeHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px 32px;border-top:1px solid #eef0ed">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8480">
              This message was sent by ${escapeHtml(BRAND.name)} on behalf of ${escapeHtml(BRAND.company)}.<br>
              Do not forward this email — the link inside can be used to access the account it refers to.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, text: textLines.join("\n") };
}

/* ------------------------------- templates ------------------------------- */

export function activationEmail(options: {
  token: string;
  expiryHours: number;
  recipientName?: string | null;
}): { subject: string; html: string; text: string } {
  const url = absoluteUrl("/activate", { token: options.token });
  const greeting = options.recipientName ? `Hello ${options.recipientName},` : "Hello,";
  const { html, text } = renderLayout({
    preheader: "Activate your RomeoVille Records administrator account.",
    heading: "Activate your administrator account",
    paragraphs: [
      `${greeting} your RomeoVille Records super administrator account has been prepared for ${BRAND.company}'s Document Department.`,
      "Set your password to activate the account and start using the system.",
      `This link can be used once and expires ${options.expiryHours} hours after this email was sent.`,
    ],
    ctaLabel: "Set my password",
    ctaUrl: url,
    notice:
      "If you did not expect this email, no action is required — the account stays inactive until the link is used.",
  });
  return { subject: "Activate your RomeoVille Records account", html, text };
}

export function invitationEmail(options: {
  token: string;
  role: Role;
  inviterName: string | null;
  inviteeName?: string | null;
  message?: string | null;
  expiryHours: number;
  isResend?: boolean;
}): { subject: string; html: string; text: string } {
  const url = absoluteUrl("/accept-invitation", { token: options.token });
  const greeting = options.inviteeName ? `Hello ${options.inviteeName},` : "Hello,";
  const intro = options.isResend
    ? "Here is your invitation link again:"
    : `${greeting} ${options.inviterName ?? "An administrator"} invited you to join RomeoVille Records as ${ROLE_LABELS[options.role]}.`;
  const paragraphs = [
    intro,
    ...(options.message ? [`Message from ${options.inviterName ?? "your administrator"}: “${options.message}”`] : []),
    "Follow the link below to choose your password and activate your account. The link can be used once.",
    `It expires ${options.expiryHours} hours after this email was sent. Ask an administrator to resend it if you miss the window.`,
  ];
  const { html, text } = renderLayout({
    preheader: `You have been invited to RomeoVille Records as ${ROLE_LABELS[options.role]}.`,
    heading: `You're invited to ${BRAND.name}`,
    paragraphs,
    ctaLabel: "Accept invitation",
    ctaUrl: url,
    notice: "Only you can use this link. If you were not expecting an invitation, please ignore this email.",
  });
  return {
    subject: `Invitation to ${BRAND.name} as ${ROLE_LABELS[options.role]}`,
    html,
    text,
  };
}

export function passwordResetEmail(options: {
  token: string;
  expiryMinutes: number;
  recipientName?: string | null;
}): { subject: string; html: string; text: string } {
  const url = absoluteUrl("/reset-password", { token: options.token });
  const greeting = options.recipientName ? `Hello ${options.recipientName},` : "Hello,";
  const { html, text } = renderLayout({
    preheader: "Reset your RomeoVille Records password.",
    heading: "Reset your password",
    paragraphs: [
      `${greeting} a password reset was requested for your account.`,
      "Choose a new password using the link below. The link can be used once.",
      `It expires ${options.expiryMinutes} minutes after this email was sent.`,
    ],
    ctaLabel: "Choose a new password",
    ctaUrl: url,
    notice:
      "If you did not request this, you can safely ignore this email — your current password stays active. As a precaution every existing session of this account will be signed out.",
  });
  return { subject: "Reset your RomeoVille Records password", html, text };
}

export function securityNotificationEmail(options: {
  recipientName?: string | null;
  heading: string;
  paragraphs: string[];
}): { subject: string; html: string; text: string } {
  const greeting = options.recipientName ? `Hello ${options.recipientName},` : "Hello,";
  const { html, text } = renderLayout({
    preheader: options.heading,
    heading: options.heading,
    paragraphs: [greeting, ...options.paragraphs],
    notice: "If you did not make this change, contact your administrator immediately.",
  });
  return { subject: `${BRAND.name}: ${options.heading}`, html, text };
}
