import { describe, expect, it } from "vitest";
import {
  ACTIVATION_TTL_HOURS,
  INVITATION_TTL_HOURS,
  PASSWORD_RESET_TTL_MINUTES,
  generateRequestId,
  generateToken,
  hashToken,
  timingSafeStringEqual,
  ttlToDate,
  tokenState,
} from "@/lib/auth/tokens";

describe("generateToken", () => {
  it("produces 43-char base64url tokens (32 random bytes)", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats across a large sample", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateToken());
    expect(seen.size).toBe(200);
  });
});

describe("generateRequestId", () => {
  it("produces 16 hex characters", () => {
    expect(generateRequestId()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("hashToken", () => {
  it("is deterministic, 64 hex chars and never equals the input", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
  });

  it("separates distinct tokens", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
    expect(hashToken("")).toMatch(/^[0-9a-f]{64}$/); // sha256 of the empty string
  });
});

describe("timingSafeStringEqual", () => {
  it("compares equal and unequal strings of the same length", () => {
    expect(timingSafeStringEqual("abcdef", "abcdef")).toBe(true);
    expect(timingSafeStringEqual("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeStringEqual("", "")).toBe(true);
  });

  it("returns false for different lengths without throwing", () => {
    expect(timingSafeStringEqual("short", "much longer value")).toBe(false);
    expect(timingSafeStringEqual("x", "")).toBe(false);
  });
});

describe("ttlToDate", () => {
  it("returns a future date at the documented offset for each token kind", () => {
    const cases = [
      { kind: "invitation" as const, ms: INVITATION_TTL_HOURS * 3_600_000 },
      { kind: "activation" as const, ms: ACTIVATION_TTL_HOURS * 3_600_000 },
      { kind: "password_reset" as const, ms: PASSWORD_RESET_TTL_MINUTES * 60_000 },
    ];
    for (const { kind, ms } of cases) {
      const before = Date.now();
      const date = ttlToDate(kind);
      const after = Date.now();
      expect(date.getTime()).toBeGreaterThanOrEqual(before + ms);
      expect(date.getTime()).toBeLessThanOrEqual(after + ms);
    }
  });

  it("matches the exported TTL constants", () => {
    expect(INVITATION_TTL_HOURS).toBe(72);
    expect(ACTIVATION_TTL_HOURS).toBe(24);
    expect(PASSWORD_RESET_TTL_MINUTES).toBe(60);
  });
});

describe("tokenState", () => {
  const future = () => new Date(Date.now() + 60_000);
  const past = () => new Date(Date.now() - 60_000);

  it("reports a live token as valid", () => {
    expect(tokenState(future())).toBe("valid");
    expect(tokenState(future(), null, null)).toBe("valid");
  });

  it("reports an expired token", () => {
    expect(tokenState(past())).toBe("expired");
    expect(tokenState(new Date())).toBe("expired"); // expiry is inclusive
  });

  it("reports consumed before expired, and revoked before expired", () => {
    expect(tokenState(future(), new Date())).toBe("consumed");
    expect(tokenState(past(), new Date())).toBe("consumed");
    expect(tokenState(past(), null, new Date())).toBe("revoked");
    expect(tokenState(future(), null, new Date())).toBe("revoked");
  });

  it("prefers consumed over revoked", () => {
    expect(tokenState(past(), new Date(), new Date())).toBe("consumed");
  });
});
