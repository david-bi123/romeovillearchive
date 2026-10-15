import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, scrubMetadata } from "@/lib/audit";
import { RATE_LIMITS, type RateLimitKind } from "@/lib/rate-limit";

describe("RATE_LIMITS", () => {
  it("defines every bucket with a positive limit and window", () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(
      ["activation", "export", "invitationSend", "login", "passwordReset", "bootstrap", "search"].sort(),
    );
    for (const config of Object.values(RATE_LIMITS)) {
      expect(config.limit).toBeGreaterThanOrEqual(1);
      expect(config.windowMs).toBeGreaterThanOrEqual(1000);
    }
  });

  it("keeps the documented values for the security-sensitive buckets", () => {
    expect(RATE_LIMITS.login).toEqual({ limit: 8, windowMs: 15 * 60_000 });
    expect(RATE_LIMITS.passwordReset).toEqual({ limit: 5, windowMs: 30 * 60_000 });
    expect(RATE_LIMITS.search.limit).toBe(120);
    expect(RATE_LIMITS.export.limit).toBe(30);
  });

  it("exposes a matching kind type for every key", () => {
    const kinds: RateLimitKind[] = Object.keys(RATE_LIMITS) as RateLimitKind[];
    expect(kinds).toContain("login");
    expect(kinds).toContain("bootstrap");
    expect(kinds).toHaveLength(7);
  });
});

describe("scrubMetadata", () => {
  it("redacts secret-looking keys at any depth", () => {
    const scrubbed = scrubMetadata({
      email: "a@example.com",
      password: "hunter2",
      PasswordHash: "$argon2id$...",
      resetToken: "abc",
      api_key: "sk-123",
      authorization: "Bearer x",
      cookie: "sid=1",
      userSession: { nested: true },
      credentialSecret: "x",
      plain: "kept",
    }) as Record<string, unknown>;

    expect(scrubbed.email).toBe("a@example.com");
    expect(scrubbed.plain).toBe("kept");
    expect(scrubbed.password).toBe("[redacted]");
    expect(scrubbed.PasswordHash).toBe("[redacted]");
    expect(scrubbed.resetToken).toBe("[redacted]");
    expect(scrubbed.api_key).toBe("[redacted]");
    expect(scrubbed.authorization).toBe("[redacted]");
    expect(scrubbed.cookie).toBe("[redacted]");
    expect(scrubbed.credentialSecret).toBe("[redacted]");
    expect(scrubbed.userSession).toBe("[redacted]"); // key matches the secret pattern
  });

  it("nulls out anything nested beyond the depth limit", () => {
    const result = scrubMetadata({ a: { b: { c: { d: { e: { f: 1 } } } } } }) as {
      a: { b: { c: { d: unknown } } };
    };
    expect(result.a.b.c.d).toEqual({ e: null });
    expect(scrubMetadata("plain", 5)).toBeNull();
    expect(scrubMetadata(undefined)).toBeNull();
  });

  it("converts dates, slices arrays and truncates long strings", () => {
    const date = new Date("2024-05-06T07:08:09.000Z");
    expect(scrubMetadata(date)).toBe("2024-05-06T07:08:09.000Z");

    const many = Array.from({ length: 60 }, (_, i) => i);
    expect((scrubMetadata(many) as unknown[]).length).toBe(50);

    const long = "x".repeat(2500);
    const scrubbed = scrubMetadata(long) as string;
    expect(scrubbed).toHaveLength(2001); // 2000 chars + ellipsis
    expect(scrubbed.endsWith("\u2026")).toBe(true);

    expect(scrubMetadata("short")).toBe("short");
    expect(scrubMetadata(42)).toBe(42);
    expect(scrubMetadata(true)).toBe(true);
    expect(scrubMetadata(null)).toBeNull();
  });

  it("does not mutate the input object", () => {
    const input = { password: "hunter2", keep: "me" };
    const result = scrubMetadata(input) as Record<string, unknown>;
    expect(input.password).toBe("hunter2");
    expect(result.password).toBe("[redacted]");
  });
});

describe("AUDIT_ACTIONS", () => {
  it("names the core lifecycle events", () => {
    expect(AUDIT_ACTIONS.LOGIN_SUCCESS).toBe("auth.login.success");
    expect(AUDIT_ACTIONS.REGISTER_CREATED).toBe("register.created");
    expect(AUDIT_ACTIONS.RECORD_CREATED).toBe("record.created");
    expect(AUDIT_ACTIONS.IMPORT_FAILED).toBe("import.failed");
    expect(AUDIT_ACTIONS.ACCESS_GRANT_CHANGED).toBe("register_access.changed");
  });

  it("has no duplicate values", () => {
    const values = Object.values(AUDIT_ACTIONS);
    expect(new Set(values).size).toBe(values.length);
  });
});
