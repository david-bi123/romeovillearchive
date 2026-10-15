"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { affectedCount, db } from "@/lib/db";
import { invitations, passwordResetTokens, users, type Role } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken, ttlToDate, tokenState } from "@/lib/auth/tokens";
import { createSession, destroySession, revokeAllSessions, type SessionUser } from "@/lib/auth/session";
import { isMailjetConfigured } from "@/lib/env";
import { sendEmail } from "@/lib/email/mailjet";
import { passwordResetEmail } from "@/lib/email/templates";
import { assertRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import {
  requestMeta,
  safeNextPath,
  toActionState,
  loginSchema,
  activationSchema,
  type ActionState,
} from "./shared";

export type { ActionState } from "./shared";

function normalizeEmail(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 255);
}

/* ---------------------------------- login --------------------------------- */

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0] as string, issue.message])),
    };
  }

  const email = normalizeEmail(parsed.data.email);
  const { ip } = await requestMeta();

  try {
    await assertRateLimit(
      "login",
      `${ip ?? "unknown"}|${email}`,
      "Too many sign-in attempts for this account.",
    );
  } catch (error) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "user",
      entityId: null,
      summary: "Sign-in attempt blocked by rate limit",
      metadata: { email, ip },
      ip,
    });
    return toActionState(error);
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  const genericError = "Email or password is incorrect.";
  if (!user) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "user",
      summary: "Sign-in failed: unknown account",
      metadata: { email, ip },
      ip,
    });
    return { ok: false, message: genericError };
  }

  const passwordOk = user.passwordHash
    ? await verifyPassword(user.passwordHash, parsed.data.password)
    : false;

  if (!passwordOk) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "user",
      entityId: user.id,
      summary: "Sign-in failed: invalid password",
      metadata: { email, ip },
      actorUserId: user.id,
      ip,
    });
    return { ok: false, message: genericError };
  }

  if (user.status === "disabled") {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "user",
      entityId: user.id,
      summary: "Sign-in failed: account disabled",
      metadata: { email, ip },
      actorUserId: user.id,
      ip,
    });
    return {
      ok: false,
      message: "This account has been deactivated. Contact your administrator to restore access.",
    };
  }

  if (user.status === "pending") {
    return {
      ok: false,
      message:
        "This account has not been activated yet. Open the activation or invitation email to set your password.",
    };
  }

  if (user.passwordHash && (await verifyNeedsRehash(user.passwordHash, parsed.data.password))) {
    const upgraded = await hashPassword(parsed.data.password);
    await db
      .update(users)
      .set({ passwordHash: upgraded, passwordUpdatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
  };

  const meta = await requestMeta();
  await createSession(sessionUser, meta);
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), lastLoginIp: (ip ?? null)?.slice(0, 64) ?? null })
    .where(eq(users.id, user.id));
  await resetRateLimit("login", `${ip ?? "unknown"}|${email}`);

  await recordAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "user",
    entityId: user.id,
    summary: "Signed in",
    metadata: { email },
    actorUserId: user.id,
    actorEmail: user.email,
    ip,
  });

  redirect(safeNextPath(parsed.data.next));
}

async function verifyNeedsRehash(storedHash: string, password: string): Promise<boolean> {
  const { needsRehash } = await import("@/lib/auth/password");
  return needsRehash(storedHash) && (await verifyPassword(storedHash, password));
}

export async function logoutAction(): Promise<void> {
  const meta = await requestMeta();
  await recordAudit({
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: "user",
    summary: "Signed out",
    actorUserId: null,
    ip: meta.ip,
  });
  await destroySession();
  redirect("/login");
}

/* ------------------------------ forgot password --------------------------- */

const forgotSchema = z.object({ email: z.string().trim().min(1).max(255) });

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, message: "Enter your email address." };

  const email = normalizeEmail(parsed.data.email);
  const { ip } = await requestMeta();

  try {
    await assertRateLimit("passwordReset", ip ?? "unknown");
  } catch (error) {
    return toActionState(error);
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  // Always answer identically so the endpoint cannot be used to enumerate
  // which addresses have accounts.
  const genericResponse: ActionState = {
    ok: true,
    message:
      "If an active account exists for that address, a password reset link has been sent. The link expires in 60 minutes.",
  };

  if (!user || user.status !== "active") {
    return genericResponse;
  }

  const token = generateToken();
  await db.insert(passwordResetTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: ttlToDate("password_reset"),
    requestIp: (ip ?? null)?.slice(0, 64) ?? null,
  });

  const { ok } = await sendEmail({
    to: user.email,
    ...passwordResetEmail({ token, expiryMinutes: 60, recipientName: user.fullName }),
    tags: ["password-reset"],
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    entityType: "user",
    entityId: user.id,
    summary: ok ? "Password reset email sent" : "Password reset email failed to send",
    metadata: { email, delivered: ok },
    actorUserId: user.id,
    ip,
  });

  if (!ok && process.env.NODE_ENV !== "production") {
    return {
      ...genericResponse,
      message: `${genericResponse.message} (Development notice: the email transport is not configured, so no message was sent.)`,
    };
  }

  return genericResponse;
}

/* --------------------------------- reset ---------------------------------- */

const resetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(1024),
});

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: "The reset link is not valid." };

  const { ip } = await requestMeta();
  const tokenHash = hashToken(parsed.data.token);

  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  const record = rows[0];

  if (!record || tokenState(record.expiresAt, record.consumedAt) !== "valid") {
    return {
      ok: false,
      message: "This reset link has expired or has already been used. Request a new one.",
    };
  }

  const problems = passwordProblems(parsed.data.password);
  if (problems.length > 0) {
    return { ok: false, message: `The new password ${problems.join(", ")}.` };
  }

  const userRows = await db.select().from(users).where(eq(users.id, record.userId)).limit(1);
  const user = userRows[0];
  if (!user || user.status !== "active") {
    return { ok: false, message: "This reset link is no longer valid." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const consumed = await db
    .update(passwordResetTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(passwordResetTokens.id, record.id), isNull(passwordResetTokens.consumedAt)));

  if (affectedCount(consumed) === 0) {
    return { ok: false, message: "This reset link has already been used." };
  }

  await db
    .update(users)
    .set({ passwordHash, passwordUpdatedAt: new Date() })
    .where(eq(users.id, user.id));

  // A password change invalidates every existing session of that account.
  await revokeAllSessions(user.id);

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
    entityType: "user",
    entityId: user.id,
    summary: "Password reset completed; all sessions revoked",
    metadata: { email: user.email },
    actorUserId: user.id,
    ip,
  });

  return { ok: true, message: "Password updated. Please sign in with your new password.", redirectTo: "/login" };
}

/* -------------------------------- activation ------------------------------ */

/**
 * Accepts an activation (bootstrap super administrator) or invitation token.
 * `kind` decides which token table is consulted; both flows share the same
 * validation rules: single use, expiring, hashed at rest.
 */
async function consumeToken(
  kind: "bootstrap" | "invitation",
  token: string,
): Promise<
  | { ok: true; invitation: typeof invitations.$inferSelect }
  | { ok: false; message: string }
> {
  const tokenHash = hashToken(token);

  const rows = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.kind, kind === "bootstrap" ? "bootstrap" : "staff")))
    .limit(1);

  const invitation = rows[0];
  if (!invitation) return { ok: false, message: "This link is not valid." };

  const state = tokenState(invitation.expiresAt, invitation.acceptedAt, invitation.revokedAt);
  if (state === "consumed" || invitation.status === "accepted") {
    return { ok: false, message: "This link has already been used. Sign in instead." };
  }
  if (state === "revoked" || invitation.status === "revoked") {
    return { ok: false, message: "This invitation was revoked. Ask an administrator to send a new one." };
  }
  if (state === "expired" || invitation.status === "expired") {
    return { ok: false, message: "This link has expired. Ask for a new one." };
  }

  return { ok: true, invitation };
}

export async function activateAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = activationSchema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path[0] as string, issue.message]),
      ),
    };
  }

  if (parsed.data.password !== parsed.data.passwordConfirm) {
    return { ok: false, message: "The two passwords do not match." };
  }
  const problems = passwordProblems(parsed.data.password);
  if (problems.length > 0) return { ok: false, message: `Password ${problems.join(", ")}.` };

  const { ip } = await requestMeta();
  try {
    await assertRateLimit("activation", ip ?? "unknown");
  } catch (error) {
    return toActionState(error);
  }

  const consumed = await consumeToken("bootstrap", parsed.data.token);
  if (!consumed.ok) return { ok: false, message: consumed.message };

  const invitation = consumed.invitation;
  const email = normalizeEmail(invitation.email);
  const passwordHash = await hashPassword(parsed.data.password);

  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    const user = existing[0];

    if (user && user.status === "active") {
      // Never let a bootstrap token overwrite or re-elevate a live account.
      await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));
      return { conflict: true as const, user: null };
    }

    const activeSuperAdmins = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.status, "active")))
      .limit(1);

    if (user) {
      // Existing pending account: activate it and grant super admin only while
      // the system still has no active super administrator.
      const nextRole: Role = activeSuperAdmins.length === 0 ? "super_admin" : user.role;
      await tx
        .update(users)
        .set({
          passwordHash,
          passwordUpdatedAt: new Date(),
          status: "active",
          role: nextRole,
          fullName: parsed.data.fullName?.trim() || user.fullName,
          deactivatedAt: null,
        })
        .where(eq(users.id, user.id));

      await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      const updated = await tx.select().from(users).where(eq(users.id, user.id)).limit(1);
      return { conflict: false as const, user: updated[0] };
    }

    if (activeSuperAdmins.length > 0) {
      // Someone else already administers the system: refuse to mint another.
      await tx
        .update(invitations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(eq(invitations.id, invitation.id));
      return { conflict: true as const, user: null };
    }

    const userId = crypto.randomUUID();
    await tx.insert(users).values({
      id: userId,
      email,
      fullName: parsed.data.fullName?.trim() || null,
      passwordHash,
      passwordUpdatedAt: new Date(),
      role: "super_admin",
      status: "active",
    });

    await tx
      .update(invitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    const created = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    return { conflict: false as const, user: created[0] };
  });

  if (outcome.conflict || !outcome.user) {
    return {
      ok: false,
      message:
        "This link is no longer valid — the account has already been activated or the system is already initialised. Use the sign-in page.",
    };
  }

  await recordAudit({
    action: AUDIT_ACTIONS.ACTIVATION_COMPLETED,
    entityType: "user",
    entityId: outcome.user.id,
    summary: "Initial super administrator activated",
    metadata: { email, role: outcome.user.role },
    actorUserId: outcome.user.id,
    ip,
  });

  const meta = await requestMeta();
  await createSession(
    {
      id: outcome.user.id,
      email: outcome.user.email,
      fullName: outcome.user.fullName,
      role: outcome.user.role,
      status: outcome.user.status,
    },
    meta,
  );

  redirect("/dashboard");
}

/* ---------------------------- accept invitation --------------------------- */

export async function acceptInvitationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = activationSchema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path[0] as string, issue.message]),
      ),
    };
  }
  if (parsed.data.password !== parsed.data.passwordConfirm) {
    return { ok: false, message: "The two passwords do not match." };
  }
  const problems = passwordProblems(parsed.data.password);
  if (problems.length > 0) return { ok: false, message: `Password ${problems.join(", ")}.` };

  const { ip } = await requestMeta();
  try {
    await assertRateLimit("activation", ip ?? "unknown");
  } catch (error) {
    return toActionState(error);
  }

  const consumed = await consumeToken("invitation", parsed.data.token);
  if (!consumed.ok) return { ok: false, message: consumed.message };

  const invitation = consumed.invitation;
  const email = normalizeEmail(invitation.email);
  const passwordHash = await hashPassword(parsed.data.password);

  const result = await db.transaction(async (tx) => {
    const existing = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    const user = existing[0];

    if (user && user.status === "active") {
      // The person is already a member: ignore the stale invitation safely.
      await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));
      return { mode: "existing" as const, user };
    }

    if (user && user.status === "disabled") {
      return { mode: "disabled" as const, user: null };
    }

    if (user) {
      await tx
        .update(users)
        .set({
          passwordHash,
          passwordUpdatedAt: new Date(),
          status: "active",
          role: invitation.role,
          fullName: parsed.data.fullName?.trim() || user.fullName,
          deactivatedAt: null,
        })
        .where(eq(users.id, user.id));
    } else {
      const userId = crypto.randomUUID();
      await tx.insert(users).values({
        id: userId,
        email,
        fullName: parsed.data.fullName?.trim() || null,
        passwordHash,
        passwordUpdatedAt: new Date(),
        role: invitation.role,
        status: "active",
      });
      const created = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));
      return { mode: "created" as const, user: created[0] };
    }

    await tx
      .update(invitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    const refreshed = await tx.select().from(users).where(eq(users.id, user!.id)).limit(1);
    return { mode: "created" as const, user: refreshed[0] };
  });

  if (result.mode === "disabled") {
    return {
      ok: false,
      message: "This account has been deactivated. Ask an administrator to restore access.",
    };
  }

  await recordAudit({
    action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
    entityType: "user",
    entityId: result.user.id,
    summary: `Accepted invitation as ${invitation.role}`,
    metadata: { email, role: invitation.role },
    actorUserId: result.user.id,
    ip,
  });

  if (result.mode === "existing") {
    return {
      ok: true,
      message: "You already have an account. Please sign in.",
      redirectTo: "/login",
    };
  }

  const meta = await requestMeta();
  await createSession(
    {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role,
      status: result.user.status,
    },
    meta,
  );

  redirect("/dashboard");
}

/* --------------------------- token pre-validation ------------------------- */

export async function inspectInvitationToken(
  token: string,
  kind: "bootstrap" | "invitation" = "invitation",
): Promise<
  | { valid: true; email: string; role: Role; fullName: string | null; message: string | null; kind: string; expiresAt: Date }
  | { valid: false; message: string }
> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  const invitation = rows[0];

  if (!invitation || (kind === "bootstrap" ? invitation.kind !== "bootstrap" : invitation.kind === "bootstrap")) {
    return { valid: false, message: "This link is not valid." };
  }
  if (invitation.status === "accepted") {
    return { valid: false, message: "This link has already been used. Sign in instead." };
  }
  if (invitation.status === "revoked") {
    return { valid: false, message: "This invitation was revoked." };
  }
  if (tokenState(invitation.expiresAt, invitation.acceptedAt, invitation.revokedAt) === "expired") {
    return { valid: false, message: "This link has expired." };
  }

  return {
    valid: true,
    email: invitation.email,
    role: invitation.role,
    fullName: invitation.fullName,
    message: invitation.message,
    kind: invitation.kind,
    expiresAt: invitation.expiresAt,
  };
}

/* ------------------------------ account security -------------------------- */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { ok: false, message: "Both fields are required." };

  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession();
  if (!session) return { ok: false, message: "Your session has expired. Please sign in again." };

  const { ip } = await requestMeta();
  await assertRateLimit("passwordReset", `${session.user.id}`);

  const rows = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const user = rows[0];
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    await recordAudit({
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: "user",
      entityId: session.user.id,
      summary: "Password change rejected: current password incorrect",
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });
    return { ok: false, message: "Your current password is incorrect." };
  }

  const problems = passwordProblems(parsed.data.newPassword);
  if (problems.length > 0) return { ok: false, message: `The new password ${problems.join(", ")}.` };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db
    .update(users)
    .set({ passwordHash, passwordUpdatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Keep this session alive, invalidate every other one.
  const { sessions } = await import("@/lib/db/schema");
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, user.id), sql`${sessions.id} <> ${session.id}`));

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: "user",
    entityId: user.id,
    summary: "Password changed; other sessions revoked",
    actorUserId: user.id,
    actorEmail: user.email,
    ip,
  });

  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

/** Reports whether the initial super administrator already exists. */
export async function previewBootstrapState(): Promise<{
  initialized: boolean;
  mailjetConfigured: boolean;
}> {
  const [active] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "super_admin"), eq(users.status, "active")))
    .limit(1);
  return { initialized: Boolean(active), mailjetConfigured: isMailjetConfigured() };
}
