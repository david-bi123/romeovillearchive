import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isStrongPassword,
  needsRehash,
  passwordProblems,
  verifyPassword,
} from "@/lib/auth/password";

describe("passwordProblems / isStrongPassword", () => {
  it("accepts a reasonable password", () => {
    expect(passwordProblems("")).toContain(`must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    expect(passwordProblems("Str0ngEnough1")).toEqual([]);
    expect(isStrongPassword("Str0ngEnough1")).toBe(true);
    expect(isStrongPassword("correct horse 7")).toBe(true);
  });

  it("enforces both length bounds", () => {
    expect(passwordProblems("Ab1short")).toEqual([
      `must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    ]);
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    const tooLong = `A1${"x".repeat(128)}`;
    expect(tooLong.length).toBeGreaterThan(PASSWORD_MAX_LENGTH);
    expect(passwordProblems(tooLong)).toEqual([
      `must be at most ${PASSWORD_MAX_LENGTH} characters long`,
    ]);
  });

  it("requires at least one letter and one number", () => {
    expect(passwordProblems("1234567890123")).toEqual(["must contain at least one letter"]);
    expect(passwordProblems("abcdefghijkl")).toEqual(["must contain at least one number"]);
    expect(passwordProblems("!@#$%^&*()!")).toContain("must contain at least one letter");
    expect(passwordProblems("!@#$%^&*()!")).toContain("must contain at least one number");
  });

  it("rejects well-known passwords", () => {
    const problems = passwordProblems("password123");
    expect(problems).toEqual(["is too common, please choose something less guessable"]);
    expect(isStrongPassword("password123")).toBe(false);
    expect(isStrongPassword("12345678901")).toBe(false);
    // Case variations are still caught.
    expect(isStrongPassword("Password123")).toBe(false);
  });

  it("rejects passwords with edge whitespace", () => {
    const leading = " abcdefg123";
    const trailing = "abcdefg123 ";
    expect(passwordProblems(leading)).toEqual(["must not start or end with whitespace"]);
    expect(passwordProblems(trailing)).toEqual(["must not start or end with whitespace"]);
    expect(isStrongPassword("abcdefg123")).toBe(true);
  });

  it("accumulates every failure at once", () => {
    const problems = passwordProblems("  12  ");
    expect(problems).toHaveLength(3); // too short, no letter, whitespace edges
    expect(isStrongPassword("  12  ")).toBe(false);
  });
});

describe("needsRehash", () => {
  it("accepts a current-strength argon2id hash", () => {
    expect(needsRehash("$argon2id$v=19$m=32768,t=3,p=1$c2FsdA$hash")).toBe(false);
  });

  it("flags weaker parameters, other algorithms and malformed hashes", () => {
    expect(needsRehash("$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$hash")).toBe(true);
    expect(needsRehash("$argon2i$v=19$m=32768,t=3,p=1$c2FsdA$hash")).toBe(true);
    expect(needsRehash("$argon2id$v=19$m=32768$t=3$broken")).toBe(true);
    expect(needsRehash("not-a-hash")).toBe(true);
    expect(needsRehash("")).toBe(true);
  });
});

describe("password hashing round trip (single argon2 pass)", () => {
  it("verifies the correct password and rejects wrong or malformed input", async () => {
    // Deliberately only ONE hash for the whole suite: argon2 is intentionally
    // slow, and this test is the only place hashing runs.
    const startedAt = Date.now();
    const stored = await hashPassword("Str0ngEnough1");
    const hashMs = Date.now() - startedAt;
    expect(hashMs).toBeLessThan(5_000); // skip-worthy guard, not a flake source

    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(stored, "Str0ngEnough1")).toBe(true);
    expect(await verifyPassword(stored, "Str0ngEnough2")).toBe(false);
    expect(await verifyPassword("corrupt-hash", "Str0ngEnough1")).toBe(false);
    expect(await verifyPassword(stored, "")).toBe(false);
    expect(await verifyPassword("", "Str0ngEnough1")).toBe(false);
  }, 15_000);

  it("rejects empty and oversized passwords without hashing", async () => {
    await expect(hashPassword("")).rejects.toThrow(/must not be empty/);
    await expect(hashPassword("x".repeat(1025))).rejects.toThrow(/at most 1024/);
    expect(await verifyPassword("$argon2id$x", "x".repeat(1025))).toBe(false);
  });
});
