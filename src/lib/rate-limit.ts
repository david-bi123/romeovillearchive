import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

/**
 * Database backed fixed-window rate limiting.
 *
 * A serverless deployment has no shared memory, so counters live in TiDB and
 * are updated atomically with a single INSERT ... ON DUPLICATE KEY statement.
 * This keeps the limiter correct across concurrent function instances.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
};

export const RATE_LIMITS = {
  /** Per IP + email for password sign-in attempts. */
  login: { limit: 8, windowMs: 15 * 60_000 },
  /** Per IP for forgot-password and reset requests. */
  passwordReset: { limit: 5, windowMs: 30 * 60_000 },
  /** Per IP+token for activation / invitation link views. */
  activation: { limit: 20, windowMs: 15 * 60_000 },
  /** Per inviter for sending invitation emails. */
  invitationSend: { limit: 30, windowMs: 60 * 60_000 },
  /** Per IP for bootstrap activation email requests. */
  bootstrap: { limit: 5, windowMs: 60 * 60_000 },
  /** Per user for search endpoints. */
  search: { limit: 120, windowMs: 60_000 },
  /** Per user for export downloads. */
  export: { limit: 30, windowMs: 60_000 },
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

export async function checkRateLimit(
  kind: RateLimitKind,
  key: string,
  override?: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const { limit, windowMs } = override ?? RATE_LIMITS[kind];
  const bucket = `${kind}:${key}`.slice(0, 190);
  const now = new Date();
  // windowMs is milliseconds; the SQL interval unit is MICROSECOND.
  const windowUs = windowMs * 1_000;

  // Assignments in ON DUPLICATE KEY UPDATE apply left to right, so `count`
  // must be computed before `window_start` is touched — otherwise the reset
  // condition in the second assignment would already see the fresh value.
  await db.execute(sql`
    INSERT INTO rate_limits (bucket, window_start, count)
    VALUES (${bucket}, ${now}, 1)
    ON DUPLICATE KEY UPDATE
      count = IF(
        window_start <= DATE_SUB(${now}, INTERVAL ${windowUs} MICROSECOND),
        1,
        count + 1
      ),
      window_start = IF(
        window_start <= DATE_SUB(${now}, INTERVAL ${windowUs} MICROSECOND),
        ${now},
        window_start
      )
  `);

  const rows = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.bucket, bucket))
    .limit(1);

  const row = rows[0];
  const count = Number(row?.count ?? 1);
  const windowStart = new Date(row?.windowStart ?? now);
  const elapsed = now.getTime() - windowStart.getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: count <= limit ? 0 : retryAfterSeconds,
    limit,
  };
}

export async function assertRateLimit(
  kind: RateLimitKind,
  key: string,
  message = "Too many attempts. Please wait a moment and try again.",
): Promise<void> {
  const result = await checkRateLimit(kind, key);
  if (!result.allowed) {
    const error = new Error(
      `${message} You can try again in about ${result.retryAfterSeconds} seconds.`,
    );
    (error as Error & { status: number; code: string }).status = 429;
    (error as Error & { status: number; code: string }).code = "rate_limited";
    throw error;
  }
}

/** Clears a bucket after a successful action (for example a good login). */
export async function resetRateLimit(kind: RateLimitKind, key: string): Promise<void> {
  const bucket = `${kind}:${key}`.slice(0, 190);
  await db.execute(sql`DELETE FROM rate_limits WHERE bucket = ${bucket}`).catch(() => undefined);
}

/** Opportunistic cleanup of stale counters; safe to call from any job. */
export async function purgeStaleRateLimits(): Promise<void> {
  await db
    .execute(
      sql`DELETE FROM rate_limits WHERE window_start <= DATE_SUB(NOW(3), INTERVAL 1 DAY)`,
    )
    .catch(() => undefined);
}
