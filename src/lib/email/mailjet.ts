import { isMailjetConfigured, getMailjetConfig, absoluteUrl } from "@/lib/env";

/**
 * Central transactional email service (Mailjet v3.1 send API).
 *
 * - All links are built from APP_BASE_URL, never from a request Host header.
 * - Only non-sensitive diagnostics are logged; API credentials and raw tokens
 *   never reach the log.
 * - Delivery status is returned to the caller so the UI can offer a safe retry.
 * - A transport can be swapped (tests use an in-memory transport).
 */

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
};

export type EmailDeliveryResult = {
  ok: boolean;
  messageId?: string;
  /** Machine readable failure reason, safe to show to administrators. */
  reason?: "not_configured" | "provider_error" | "invalid_recipient" | "unknown";
  error?: string;
};

export type EmailTransport = (email: OutboundEmail) => Promise<EmailDeliveryResult>;

const MAILJET_SEND_URL = "https://api.mailjet.com/v3.1/send";

async function mailjetTransport(email: OutboundEmail): Promise<EmailDeliveryResult> {
  if (!isMailjetConfigured()) {
    return { ok: false, reason: "not_configured", error: "Mailjet credentials are not configured." };
  }

  const { apiKey, apiSecret, fromEmail, fromName } = getMailjetConfig();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64");

  try {
    const response = await fetch(MAILJET_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: fromEmail, Name: fromName },
            To: [{ Email: email.to }],
            Subject: email.subject,
            TextPart: email.text,
            HTMLPart: email.html,
            ...(email.tags?.length ? { CustomID: email.tags.join(",") } : {}),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      Messages?: Array<{ Status?: string; To?: Array<{ MessageID?: number; Status?: string; Error?: string }> }>;
      ErrorMessage?: string;
    };

    if (!response.ok) {
      const status = payload.Messages?.[0]?.To?.[0]?.Error ?? payload.ErrorMessage ?? "provider_error";
      console.error("[email] mailjet rejected message", { status: response.status, detail: status });
      return { ok: false, reason: "provider_error", error: `Mailjet responded with HTTP ${response.status}` };
    }

    const messageId = payload.Messages?.[0]?.To?.[0]?.MessageID?.toString();
    return { ok: true, messageId };
  } catch (error) {
    console.error(
      "[email] delivery failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, reason: "provider_error", error: "Network error while contacting Mailjet." };
  }
}

let transport: EmailTransport = mailjetTransport;

export function setEmailTransport(next: EmailTransport): void {
  transport = next;
}

export function resetEmailTransport(): void {
  transport = mailjetTransport;
}

export function isEmailTransportConfigured(): boolean {
  return isMailjetConfigured();
}

export async function sendEmail(email: OutboundEmail): Promise<EmailDeliveryResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.to)) {
    return { ok: false, reason: "invalid_recipient", error: "Recipient address is not valid." };
  }

  const result = await transport(email);

  console.log(
    JSON.stringify({
      level: "info",
      event: "email.delivery",
      to: email.to,
      subject: email.subject,
      ok: result.ok,
      reason: result.reason ?? null,
      tags: email.tags ?? [],
      messageId: result.messageId ?? null,
    }),
  );

  // Development safety net: when Mailjet is not configured, surface the link in
  // the server console ONLY in non-production environments so the local
  // workflow remains testable. Nothing is printed in production.
  if (!result.ok && result.reason === "not_configured" && process.env.NODE_ENV !== "production") {
    console.warn(
      `[email:dev] Mailjet is not configured. Destination: ${email.to}\nSubject: ${email.subject}\nPlain text body:\n${email.text}`,
    );
  }

  return result;
}

export { absoluteUrl };
