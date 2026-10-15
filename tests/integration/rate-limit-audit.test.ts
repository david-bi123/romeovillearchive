import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { auditLogs, rateLimits } from "@/lib/db/schema";
import { assertRateLimit, checkRateLimit, purgeStaleRateLimits, resetRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { describeWithDb, uniqueId } from "./helpers/db";

/**
 * Fixed-window rate limiting and the append-only audit trail, exercised
 * against the real SQL the app runs (including the INTERVAL ? MICROSECOND
 * window arithmetic, which only a live server can validate).
 */
describeWithDb("rate limiting against a real database", () => {
  const key = uniqueId();
  const bucket = `search:${key}`;
  const shortWindow = { limit: 3, windowMs: 3_000 };

  afterEach(async () => {
    await db.delete(rateLimits).where(eq(rateLimits.bucket, bucket));
  });

  it("counts attempts inside a window and reports the remainder", async () => {
    const first = await checkRateLimit("search", key, shortWindow);
    expect(first).toMatchObject({ allowed: true, remaining: 2, retryAfterSeconds: 0, limit: 3 });

    const second = await checkRateLimit("search", key, shortWindow);
    expect(second).toMatchObject({ allowed: true, remaining: 1 });

    const third = await checkRateLimit("search", key, shortWindow);
    expect(third).toMatchObject({ allowed: true, remaining: 0 });

    const fourth = await checkRateLimit("search", key, shortWindow);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("starts a fresh window once the old one has expired", async () => {
    await checkRateLimit("search", key, shortWindow);
    await checkRateLimit("search", key, shortWindow);
    await checkRateLimit("search", key, shortWindow);
    const denied = await checkRateLimit("search", key, shortWindow);
    expect(denied.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, shortWindow.windowMs + 300));

    const afterExpiry = await checkRateLimit("search", key, shortWindow);
    expect(afterExpiry.allowed).toBe(true);
    expect(afterExpiry.remaining).toBe(shortWindow.limit - 1);
  });

  it("deletes the bucket on reset", async () => {
    await checkRateLimit("search", key, shortWindow);
    const rows = await db.select().from(rateLimits).where(eq(rateLimits.bucket, bucket));
    expect(rows).toHaveLength(1);

    await resetRateLimit("search", key);
    const afterReset = await db.select().from(rateLimits).where(eq(rateLimits.bucket, bucket));
    expect(afterReset).toHaveLength(0);
  });

  it("throws a 429 once a kind's default limit is exceeded", async () => {
    const assertKey = `it-assert-${uniqueId()}`;
    const assertBucket = `login:${assertKey}`;
    // login: limit 8 per 15 minutes — eight calls pass, the ninth is rejected.
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await expect(assertRateLimit("login", assertKey)).resolves.toBeUndefined();
    }

    await expect(assertRateLimit("login", assertKey)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      message: expect.stringMatching(/try again in about \d+ seconds/),
    });

    await db.delete(rateLimits).where(eq(rateLimits.bucket, assertBucket));
  });

  it("purges buckets whose window is older than a day", async () => {
    const staleBucket = `it-stale-${uniqueId()}`;
    const freshBucket = `it-fresh-${uniqueId()}`;
    await db.insert(rateLimits).values([
      { bucket: staleBucket, windowStart: new Date(Date.now() - 2 * 86_400_000), count: 5 },
      { bucket: freshBucket, windowStart: new Date(), count: 1 },
    ]);

    await purgeStaleRateLimits();

    const stale = await db.select().from(rateLimits).where(eq(rateLimits.bucket, staleBucket));
    expect(stale).toHaveLength(0);
    const fresh = await db.select().from(rateLimits).where(eq(rateLimits.bucket, freshBucket));
    expect(fresh).toHaveLength(1);

    await db.delete(rateLimits).where(eq(rateLimits.bucket, freshBucket));
  });
});

describeWithDb("audit trail against a real database", () => {
  const writtenRequestIds: string[] = [];

  afterEach(async () => {
    for (const requestId of writtenRequestIds) {
      await db.delete(auditLogs).where(eq(auditLogs.requestId, requestId));
    }
    writtenRequestIds.length = 0;
    vi.restoreAllMocks();
  });

  it("scrubs secrets, truncates oversized columns and persists the row", async () => {
    const requestId = uniqueId();
    writtenRequestIds.push(requestId);

    await recordAudit({
      action: "a".repeat(100),
      entityType: "it.entity".repeat(20),
      entityId: "e".repeat(100),
      summary: "s".repeat(500),
      metadata: {
        password: "hunter2",
        apiKey: "key-123",
        keep: "visible",
        nested: { sessionToken: "tok", deep: { count: 1 } },
      },
      actorEmail: `${"m".repeat(300)}@example.test`,
      ip: "i".repeat(100),
      requestId,
    });

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.requestId, requestId));
    expect(rows).toHaveLength(1);
    const row = rows[0];

    expect(row.action).toHaveLength(80);
    expect(row.entityType.length).toBeLessThanOrEqual(60);
    expect(row.entityId).toHaveLength(64);
    expect(row.summary).toHaveLength(400);
    expect(row.actorEmail).toHaveLength(255);
    expect(row.ip).toHaveLength(64);

    const metadata = (
      typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata
    ) as Record<string, unknown> & { nested: { sessionToken: string; deep: { count: number } } };
    expect(metadata.password).toBe("[redacted]");
    expect(metadata.apiKey).toBe("[redacted]");
    expect(metadata.keep).toBe("visible");
    expect(metadata.nested.sessionToken).toBe("[redacted]");
    expect(metadata.nested.deep.count).toBe(1);
  });

  it("never throws when the write fails (FK violation) and logs instead", async () => {
    const requestId = uniqueId();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // actor_user_id references users.id — a random UUID violates the FK and
    // exercises recordAudit's catch-and-report path.
    await expect(
      recordAudit({
        action: "it.test.broken",
        entityType: "it.entity",
        actorUserId: uniqueId(),
        requestId,
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.requestId, requestId));
    expect(rows).toHaveLength(0);
  });

  it("generates a requestId when the caller omits one", async () => {
    await recordAudit({
      action: "it.test.generated",
      entityType: "it.entity",
      summary: "short summary",
    });

    const written = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "it.test.generated"));
    expect(written.length).toBeGreaterThanOrEqual(1);
    expect(written[0].requestId).toBeTruthy();
    expect(written[0].summary).toBe("short summary");

    for (const row of written) {
      await db.delete(auditLogs).where(eq(auditLogs.id, row.id));
    }
  });
});
