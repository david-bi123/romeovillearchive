"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { affectedCount, db, rawRows } from "@/lib/db";
import { invitations, sessions, users, type Role } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { AppError, requireSessionOrThrow } from "@/lib/auth/guard";
import { canAssignRole, canManageUser, ROLE_LABELS, type Capability } from "@/lib/auth/rbac";
import { generateToken, hashToken, MAX_INVITATION_RESENDS, ttlToDate, tokenState } from "@/lib/auth/tokens";
import { revokeAllSessions } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email/mailjet";
import { invitationEmail, securityNotificationEmail } from "@/lib/email/templates";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  inviteSchema,
  readSetting,
  requestMeta,
  toActionState,
  updateUserSchema,
  writeSetting,
  type ActionState,
} from "./shared";

export type { Capability };

/* ------------------------------ authorization ---------------------------- */

async function assertCanInvite(): Promise<ReturnType<typeof requireSessionOrThrow> extends Promise<infer S> ? S : never> {
  const session = await requireSessionOrThrow();
  const isSuper = session.user.role === "super_admin";
  const isAdmin = session.user.role === "admin";

  if (isSuper) return session;

  if (isAdmin) {
    const allowAdminInvites = (await readSetting("allow_admin_invitations")) === "true";
    if (!allowAdminInvites) {
      throw new AppError(
        "Administrators may only invite staff when the super administrator enables it in Security settings.",
        403,
        "forbidden",
      );
    }
    return session;
  }

  throw new AppError("Your role does not allow sending invitations.", 403, "forbidden");
}

function assertRoleAllowed(actorRole: Role, targetRole: Role): void {
  if (!canAssignRole(actorRole, targetRole)) {
    throw new AppError(
      `You cannot assign the ${ROLE_LABELS[targetRole]} role.`,
      403,
      "forbidden",
    );
  }
}

/* --------------------------------- invite -------------------------------- */

export async function inviteUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await assertCanInvite();

    const parsed = inviteSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
      fullName: formData.get("fullName") || null,
      message: formData.get("message") || null,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false,
        errors: { [String(first.path[0] ?? "email")]: first.message },
      };
    }

    const email = parsed.data.email.trim().toLowerCase();
    if (email === session.user.email.toLowerCase() && parsed.data.role === "super_admin") {
      return { ok: false, message: "You already hold that role." };
    }

    assertRoleAllowed(session.user.role, parsed.data.role);

    const { ip } = await requestMeta();
    await assertRateLimit("invitationSend", session.user.id);

    const existingRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const existingUser = existingRows[0];

    if (existingUser?.status === "active") {
      return {
        ok: false,
        message: `${email} already has an active account. Change their role from the users list instead.`,
      };
    }
    if (existingUser?.status === "disabled") {
      return {
        ok: false,
        message: `${email} has a deactivated account. Re-enable it from the users list instead of inviting again.`,
      };
    }

    const token = generateToken();
    const expiresAt = ttlToDate("invitation");

    const invitationId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      // Replace any outstanding invitation for this address so there is never
      // more than one live token per email.
      await tx
        .update(invitations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(and(eq(invitations.email, email), eq(invitations.status, "pending")));

      if (existingUser) {
        await tx
          .update(users)
          .set({
            role: parsed.data.role,
            fullName: parsed.data.fullName || existingUser.fullName,
          })
          .where(eq(users.id, existingUser.id));
      } else {
        await tx.insert(users).values({
          id: crypto.randomUUID(),
          email,
          fullName: parsed.data.fullName || null,
          role: parsed.data.role,
          status: "pending",
        });
      }

      await tx.insert(invitations).values({
        id: invitationId,
        kind: "staff",
        email,
        fullName: parsed.data.fullName || null,
        message: parsed.data.message || null,
        role: parsed.data.role,
        tokenHash: hashToken(token),
        status: "pending",
        invitedByUserId: session.user.id,
        expiresAt,
        sentAt: new Date(),
      });
    });

    const { ok, reason } = await sendEmail({
      to: email,
      ...invitationEmail({
        token,
        role: parsed.data.role,
        inviterName: session.user.fullName,
        inviteeName: parsed.data.fullName,
        message: parsed.data.message,
        expiryHours: 72,
      }),
      tags: ["invitation"],
    });

    await recordAudit({
      action: AUDIT_ACTIONS.INVITATION_CREATED,
      entityType: "invitation",
      entityId: invitationId,
      summary: `Invited ${email} as ${ROLE_LABELS[parsed.data.role]}${ok ? "" : " (email failed)"}`,
      metadata: { email, role: parsed.data.role, delivered: ok, reason: reason ?? null },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    if (!ok) {
      return {
        ok: false,
        message: `The invitation for ${email} was created, but the email could not be sent${reason === "not_configured" ? " because Mailjet is not configured" : ""}. You can resend it once email delivery is working.`,
        errors: {},
      };
    }

    return {
      ok: true,
      message: `Invitation sent to ${email}.`,
      redirectTo: "/users",
    };
  } catch (error) {
    return toActionState(error);
  }
}

/* --------------------------------- resend -------------------------------- */

export async function resendInvitationAction(invitationId: string): Promise<ActionState> {
  try {
    const session = await assertCanInvite();
    const { ip } = await requestMeta();
    await assertRateLimit("invitationSend", session.user.id);

    const rows = await db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
    const invitation = rows[0];
    if (!invitation) return { ok: false, message: "Invitation not found." };
    if (invitation.status === "accepted") {
      return { ok: false, message: "This invitation was already accepted." };
    }
    if (invitation.status === "revoked") {
      return { ok: false, message: "This invitation was revoked. Send a new one instead." };
    }
    if (invitation.resendCount >= MAX_INVITATION_RESENDS) {
      return {
        ok: false,
        message: `This invitation has been resent ${MAX_INVITATION_RESENDS} times. Create a new invitation instead.`,
      };
    }

    const token = generateToken();
    await db
      .update(invitations)
      .set({
        tokenHash: hashToken(token),
        status: "pending",
        expiresAt: ttlToDate("invitation"),
        sentAt: new Date(),
        resendCount: invitation.resendCount + 1,
        revokedAt: null,
      })
      .where(eq(invitations.id, invitationId));

    const { ok, reason } = await sendEmail({
      to: invitation.email,
      ...invitationEmail({
        token,
        role: invitation.role,
        inviterName: session.user.fullName,
        inviteeName: invitation.fullName,
        message: invitation.message,
        expiryHours: 72,
        isResend: true,
      }),
      tags: ["invitation", "resend"],
    });

    await recordAudit({
      action: AUDIT_ACTIONS.INVITATION_RESENT,
      entityType: "invitation",
      entityId: invitationId,
      summary: `Resent invitation to ${invitation.email}${ok ? "" : " (email failed)"}`,
      metadata: { email: invitation.email, delivered: ok, reason: reason ?? null, resendCount: invitation.resendCount + 1 },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    if (!ok) {
      return {
        ok: false,
        message: `The invitation was refreshed but the email failed${reason === "not_configured" ? " (Mailjet is not configured)" : ""}. Try again shortly.`,
      };
    }

    return { ok: true, message: `Invitation resent to ${invitation.email}.` };
  } catch (error) {
    return toActionState(error);
  }
}

/* --------------------------------- revoke -------------------------------- */

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    const isSuper = session.user.role === "super_admin";
    const isAdmin = session.user.role === "admin";
    if (!isSuper && !isAdmin) {
      throw new AppError("Your role does not allow revoking invitations.", 403, "forbidden");
    }
    if (isAdmin && (await readSetting("allow_admin_invitations")) !== "true") {
      throw new AppError("Invitation management is currently limited to the super administrator.", 403, "forbidden");
    }

    const rows = await db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
    const invitation = rows[0];
    if (!invitation) return { ok: false, message: "Invitation not found." };
    if (invitation.status === "accepted") {
      return { ok: false, message: "This invitation has already been accepted." };
    }

    await db
      .update(invitations)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(invitations.id, invitationId));

    // Any pending user created with this invitation returns to a non-invitable
    // state until a new invitation is issued.
    const pending = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, invitation.email), eq(users.status, "pending")))
      .limit(1);
    if (pending[0]) {
      await db.delete(users).where(eq(users.id, pending[0].id));
    }

    await recordAudit({
      action: AUDIT_ACTIONS.INVITATION_REVOKED,
      entityType: "invitation",
      entityId: invitationId,
      summary: `Revoked invitation for ${invitation.email}`,
      metadata: { email: invitation.email },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip: (await requestMeta()).ip,
    });

    return { ok: true, message: `Invitation for ${invitation.email} revoked.` };
  } catch (error) {
    return toActionState(error);
  }
}

/* ----------------------------- user management --------------------------- */

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    const parsed = updateUserSchema.safeParse({
      userId: formData.get("userId"),
      role: formData.get("role") || undefined,
      status: formData.get("status") || undefined,
      fullName: formData.get("fullName") || undefined,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, errors: { [String(first.path[0] ?? "form")]: first.message } };
    }

    const targetRows = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
    const target = targetRows[0];
    if (!target) return { ok: false, message: "User not found." };

    if (!canManageUser(session.user.role, target.role, target.id === session.user.id)) {
      throw new AppError(
        target.role === "super_admin"
          ? "The super administrator account cannot be changed here."
          : "You do not have permission to change this account.",
        403,
        "forbidden",
      );
    }

    const patch: Partial<typeof users.$inferInsert> = {};
    const changes: Record<string, unknown> = {};

    if (parsed.data.fullName !== undefined && parsed.data.fullName !== target.fullName) {
      patch.fullName = parsed.data.fullName || null;
      changes.fullName = { from: target.fullName, to: patch.fullName };
    }

    if (parsed.data.role && parsed.data.role !== target.role) {
      assertRoleAllowed(session.user.role, parsed.data.role);
      if (target.role === "super_admin") {
        throw new AppError(
          "The super administrator role cannot be demoted. Create another administrator if you need a backup account.",
          403,
          "protected_account",
        );
      }
      patch.role = parsed.data.role;
      changes.role = { from: target.role, to: parsed.data.role };
    }

    if (parsed.data.status && parsed.data.status !== target.status) {
      if (target.role === "super_admin") {
        throw new AppError(
          "The super administrator account cannot be deactivated.",
          403,
          "protected_account",
        );
      }
      if (parsed.data.status === "active" && target.status === "pending") {
        throw new AppError(
          "This account has not been activated yet. Ask the person to use their invitation link.",
          409,
          "not_activated",
        );
      }
      patch.status = parsed.data.status;
      patch.deactivatedAt = parsed.data.status === "disabled" ? new Date() : null;
      changes.status = { from: target.status, to: parsed.data.status };
    }

    if (Object.keys(patch).length === 0) {
      return { ok: true, message: "No changes to save." };
    }

    await db.update(users).set(patch).where(eq(users.id, target.id));

    if (patch.status === "disabled") {
      await revokeAllSessions(target.id);
    }

    if (patch.role || patch.status) {
      const subject = patch.status === "disabled" ? "Your account has been deactivated" : "Your access level changed";
      await sendEmail({
        to: target.email,
        ...securityNotificationEmail({
          recipientName: target.fullName,
          heading: subject,
          paragraphs: [
            patch.status === "disabled"
              ? "An administrator deactivated your account. You have been signed out of all devices."
              : patch.role
                ? `An administrator changed your role to ${ROLE_LABELS[patch.role]}. The change applies the next time you reload the page.`
                : "An administrator updated your account details.",
          ],
        }),
        tags: ["security"],
      });
    }

    await recordAudit({
      action: patch.status === "disabled"
        ? AUDIT_ACTIONS.USER_DISABLED
        : patch.status === "active"
          ? AUDIT_ACTIONS.USER_ENABLED
          : patch.role
            ? AUDIT_ACTIONS.USER_ROLE_CHANGED
            : AUDIT_ACTIONS.USER_PROFILE_UPDATED,
      entityType: "user",
      entityId: target.id,
      summary: `Updated ${target.email}`,
      metadata: changes,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip: (await requestMeta()).ip,
    });

    return { ok: true, message: `${target.email} updated.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function revokeUserSessionsAction(userId: string): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    const target = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!target) return { ok: false, message: "User not found." };
    if (!canManageUser(session.user.role, target.role, target.id === session.user.id)) {
      throw new AppError("You do not have permission to manage this account.", 403, "forbidden");
    }

    const revoked = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    await recordAudit({
      action: AUDIT_ACTIONS.USER_SESSIONS_REVOKED,
      entityType: "user",
      entityId: userId,
      summary: `Signed ${target.email} out of all devices`,
      metadata: { sessions: affectedCount(revoked) },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip: (await requestMeta()).ip,
    });

    return { ok: true, message: `Signed ${target.email} out of every device.` };
  } catch (error) {
    return toActionState(error);
  }
}

/* ------------------------------- settings -------------------------------- */

export async function updateSecuritySettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    if (session.user.role !== "super_admin") {
      throw new AppError("Only the super administrator can change security settings.", 403, "forbidden");
    }

    const allowAdminInvitations = formData.get("allowAdminInvitations") === "true";
    await writeSetting("allow_admin_invitations", allowAdminInvitations ? "true" : "false");

    await recordAudit({
      action: AUDIT_ACTIONS.SETTING_CHANGED,
      entityType: "settings",
      entityId: "security",
      summary: `Administrators may ${allowAdminInvitations ? "" : "no longer "}send invitations`,
      metadata: { allowAdminInvitations },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip: (await requestMeta()).ip,
    });

    return { ok: true, message: "Security settings saved." };
  } catch (error) {
    return toActionState(error);
  }
}

/* --------------------------------- queries -------------------------------- */

export type UserListItem = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  status: "pending" | "active" | "disabled";
  lastLoginAt: Date | null;
  createdAt: Date;
  activeSessions: number;
};

export async function listUsersForAdmin(): Promise<UserListItem[]> {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  if (rows.length === 0) return [];

  const userIds = rows.map((user) => user.id);
  const sessionCounts = await rawRows<{ user_id: string; total: number }>(
    sql`SELECT user_id, COUNT(*) AS total FROM sessions
        WHERE user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
          AND revoked_at IS NULL AND expires_at > NOW(3)
        GROUP BY user_id`,
  );
  const counts = new Map(sessionCounts.map((row) => [row.user_id, Number(row.total)]));

  return rows.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    activeSessions: counts.get(user.id) ?? 0,
  }));
}

export type InvitationListItem = typeof invitations.$inferSelect & {
  invitedByName: string | null;
  displayState: "pending" | "accepted" | "expired" | "revoked";
};

export async function listInvitationsForAdmin(): Promise<InvitationListItem[]> {
  const rows = await db
    .select({
      invitation: invitations,
      inviterName: users.fullName,
    })
    .from(invitations)
    .leftJoin(users, eq(invitations.invitedByUserId, users.id))
    .orderBy(desc(invitations.createdAt));

  return rows.map(({ invitation, inviterName }) => {
    const computedState =
      invitation.status === "pending" &&
      tokenState(invitation.expiresAt, invitation.acceptedAt, invitation.revokedAt) === "expired"
        ? "expired"
        : invitation.status;
    return { ...invitation, invitedByName: inviterName, displayState: computedState };
  });
}

export async function hasActiveSuperAdmin(): Promise<boolean> {
  const rows = await rawRows<{ id: string }>(
    sql`SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' LIMIT 1`,
  );
  return rows.length > 0;
}
