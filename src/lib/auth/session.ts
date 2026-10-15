import { cookies } from "next/headers";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { affectedCount, db } from "@/lib/db";
import { sessions, users, type Role, type UserStatus } from "@/lib/db/schema";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "rv_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days absolute
const SESSION_TOUCH_MS = 1000 * 60 * 5; // throttle last_seen writes

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  status: UserStatus;
};

export type Session = {
  id: string;
  user: SessionUser;
  expiresAt: Date;
};

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/** Creates a database-backed session and sets the HTTP-only cookie. */
export async function createSession(
  user: SessionUser,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const store = await cookies();

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
    ip: context.ip?.slice(0, 64) ?? null,
    userAgent: context.userAgent?.slice(0, 400) ?? null,
  });

  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return token;
}

/**
 * Resolves the current session. Returns null when the cookie is missing, the
 * session was revoked or expired, or the account is no longer active - which is
 * how disabling an account also invalidates its live sessions.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        sql`${sessions.expiresAt} > NOW(3)`,
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = new Date();
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    id: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      status: row.status,
    },
  };
}

/** Convenience for server components/actions: authenticated user or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)))
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
}

/** Invalidates every live session belonging to a user (disable, password reset). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function countActiveSessions(userId: string): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        sql`${sessions.expiresAt} > NOW(3)`,
      ),
    );
  return rows.length;
}

/** Housekeeping: removes sessions that expired more than a day ago. */
export async function purgeExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 86_400_000);
  const result = await db.delete(sessions).where(lte(sessions.expiresAt, cutoff));
  return affectedCount(result);
}
