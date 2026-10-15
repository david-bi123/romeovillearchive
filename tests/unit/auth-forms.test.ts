import { describe, expect, it } from "vitest";
import { activationSchema, loginSchema } from "@/server/actions/auth";
import { safeNextPath } from "@/server/actions/shared";

/**
 * Regression tests for the "Expected string, received null" sign-in failure.
 *
 * FormData.get() returns `null` for fields the form did not render (e.g. the
 * hidden `next` input is only present when redirecting to /login, and
 * `fullName` may be absent). Schemas fed directly from FormData must accept
 * null for every optional field.
 */
describe("loginSchema", () => {
  it("accepts a direct sign-in with no `next` field (FormData null)", () => {
    const formData = new FormData();
    formData.set("email", "indenturerecords@gmail.com");
    formData.set("password", "some-password");

    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      next: formData.get("next"),
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(safeNextPath(parsed.data.next)).toBe("/dashboard");
    }
  });

  it("still honours a safe `next` destination", () => {
    const parsed = loginSchema.safeParse({
      email: "a@example.com",
      password: "password123",
      next: "/registers",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(safeNextPath(parsed.data.next)).toBe("/registers");
    }
  });

  it("still rejects missing email and password", () => {
    const parsed = loginSchema.safeParse({ email: null, password: null, next: null });
    expect(parsed.success).toBe(false);
  });
});

describe("activationSchema", () => {
  it("accepts a missing `fullName` field (FormData null)", () => {
    const formData = new FormData();
    formData.set("token", "a-very-long-token-value-12345");
    formData.set("password", "SomeStrongPassword1!");
    formData.set("passwordConfirm", "SomeStrongPassword1!");

    const parsed = activationSchema.safeParse({
      token: formData.get("token"),
      fullName: formData.get("fullName"),
      password: formData.get("password"),
      passwordConfirm: formData.get("passwordConfirm"),
    });

    expect(parsed.success).toBe(true);
  });
});
