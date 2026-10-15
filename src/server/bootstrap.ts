import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations, users } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { generateToken, hashToken, MAX_ACTIVATION_RESENDS, ttlToDate, tokenState } from "@/lib/auth/tokens";
import { getBootstrapSecret, initialSuperAdminEmail } from "@/lib/env";
import { sendEmail } from "@/lib/email/mailjet";
import { activationEmail } from "@/lib/email/templates";

/**
 * Initial super administrator bootstrap.
 *
 * Guarantees:
 *  - idempotent: running it repeatedly never creates a second live token or a
 *    second account, and never overwrites an existing super administrator;
 *  - concurrency safe: concurrent calls converge on a single pending
 *    invitation (stale ones are revoked first) and activation is single use;
 *  - protected: requires BOOTSTRAP_SECRET in production and is rate limited;
 *  - silent unless asked: page loads never trigger emails — only this explicit
 *    entry point does, with controlled resend behaviour.
 */

export type BootstrapOutcome =
  | { status: "initialized"; message: string }
  | { status: "pending"; message: string; sentAt: Date | null; expiresAt: Date; resendCount: number }
  | { status: "sent"; message: string; invitationId: string }
  | { status: "email_failed"; message: string; invitationId: string; reason?: string }
  | { status: "rejected"; message: string };

export async function triggerSuperAdminActivation(options: {
  resend?: boolean;
  ip?: string | null;
  emailTransportConfigured?: boolean;
}): Promise<BootstrapOutcome> {
  const email = initialSuperAdminEmail();

  // 1. Never touch an already initialised system.
  const activeAdmins = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.role, "super_admin"), eq(users.status, "active")))
    .limit(1);

  if (activeAdmins[0]) {
    return {
      status: "initialized",
      message: `The system is already initialised (super administrator: ${activeAdmins[0].email}). No invitation was created.`,
    };
  }

  // 2. Inspect any existing bootstrap invitation for this address.
  const existing = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.kind, "bootstrap"), eq(invitations.email, email)))
    .orderBy(invitations.createdAt)
    .limit(1);

  const current = existing[0];

  if (current) {
    const state = tokenState(current.expiresAt, current.acceptedAt, current.revokedAt);
    const stillPending = current.status === "pending" && state === "valid";

    if (stillPending && current.sentAt && !options.resend) {
      return {
        status: "pending",
        message:
          "An activation email has already been sent for the initial super administrator. Follow the link in that email, or request a resend if it expired or was lost.",
        sentAt: current.sentAt,
        expiresAt: current.expiresAt,
        resendCount: current.resendCount,
      };
    }

    if (options.resend && current.resendCount >= MAX_ACTIVATION_RESENDS) {
      return {
        status: "rejected",
        message: `This activation link has already been sent ${MAX_ACTIVATION_RESENDS} times. Revoke the pending invitation first to start over.`,
      };
    }
  }

  // 3. Rotate (or create) the single-use token. Any previous pending bootstrap
  //    invitation for this address is revoked so only one link is ever live.
  const token = generateToken();
  const invitationId = current?.id ?? crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(eq(invitations.kind, "bootstrap"), eq(invitations.email, email)));

    if (current) {
      await tx
        .update(invitations)
        .set({
          tokenHash: hashToken(token),
          status: "pending",
          expiresAt: ttlToDate("activation"),
          sentAt: new Date(),
          resendCount: current.resendCount + 1,
          revokedAt: null,
          acceptedAt: null,
        })
        .where(eq(invitations.id, current.id));
    } else {
      await tx.insert(invitations).values({
        id: invitationId,
        kind: "bootstrap",
        email,
        fullName: null,
        role: "super_admin",
        tokenHash: hashToken(token),
        status: "pending",
        invitedByUserId: null,
        expiresAt: ttlToDate("activation"),
        sentAt: new Date(),
        resendCount: 0,
      });
    }
  });

  // 4. Deliver the activation email.
  const { ok, reason } = await sendEmail({
    to: email,
    ...activationEmail({ token, expiryHours: 24 }),
    tags: ["bootstrap", "activation"],
  });

  await recordAudit({
    action: AUDIT_ACTIONS.BOOTSTRAP_INVITATION_CREATED,
    entityType: "invitation",
    entityId: invitationId,
    summary: ok
      ? "Initial super administrator activation email sent"
      : "Initial super administrator invitation created (email failed)",
    metadata: { email, delivered: ok, reason: reason ?? null, resend: Boolean(options.resend) },
    actorUserId: null,
    actorEmail: null,
    ip: options.ip ?? null,
  });

  if (!ok) {
    return {
      status: "email_failed",
      message:
        reason === "not_configured"
          ? "The invitation was created but Mailjet is not configured, so no email was sent. Configure MAILJET_API_KEY / MAILJET_API_SECRET and retry."
          : "The invitation was created but the email could not be delivered. Check the Mailjet credentials and retry.",
      invitationId,
      reason,
    };
  }

  return {
    status: "sent",
    message: `Activation email sent to ${email}. The link expires in 24 hours.`,
    invitationId,
  };
}

/** Verifies the BOOTSTRAP_SECRET presented by a bootstrap request. */
export function verifyBootstrapSecret(provided: string | null): boolean {
  const expected = getBootstrapSecret();
  if (!expected) return false;
  if (process.env.NODE_ENV !== "production" && !provided) return true; // dev convenience
  if (!provided) return false;
  return provided === expected;
}

export async function getBootstrapState(): Promise<{
  initialized: boolean;
  pendingInvitation: null | { sentAt: Date | null; expiresAt: Date; resendCount: number; expired: boolean };
  emailConfigured: boolean;
}> {
  const { isMailjetConfigured } = await import("@/lib/env");
  const activeAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "super_admin"), eq(users.status, "active")))
    .limit(1);

  const invitation = (
    await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.kind, "bootstrap"), eq(invitations.email, initialSuperAdminEmail())))
      .orderBy(invitations.createdAt)
      .limit(1)
  )[0];

  return {
    initialized: Boolean(activeAdmins[0]),
    emailConfigured: isMailjetConfigured(),
    pendingInvitation:
      invitation && invitation.status === "pending"
        ? {
            sentAt: invitation.sentAt,
            expiresAt: invitation.expiresAt,
            resendCount: invitation.resendCount,
            expired: tokenState(invitation.expiresAt, invitation.acceptedAt, invitation.revokedAt) === "expired",
          }
        : null,
  };
}
