import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Single-use, high entropy bearer tokens (activation, invitation, password
 * reset). Only a SHA-256 hash is ever persisted; the raw token exists solely in
 * the email link delivered to the recipient.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateRequestId(): string {
  return randomBytes(8).toString("hex");
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const INVITATION_TTL_HOURS = 72;
export const ACTIVATION_TTL_HOURS = 24;
export const PASSWORD_RESET_TTL_MINUTES = 60;
export const MAX_INVITATION_RESENDS = 5;
export const MAX_ACTIVATION_RESENDS = 5;

export function ttlToDate(kind: "invitation" | "activation" | "password_reset"): Date {
  const now = new Date();
  switch (kind) {
    case "invitation":
      return new Date(now.getTime() + INVITATION_TTL_HOURS * 3600_000);
    case "activation":
      return new Date(now.getTime() + ACTIVATION_TTL_HOURS * 3600_000);
    case "password_reset":
      return new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000);
  }
}

export function tokenState(
  expiresAt: Date,
  consumedAt?: Date | null,
  revokedAt?: Date | null,
): "valid" | "expired" | "consumed" | "revoked" {
  if (consumedAt) return "consumed";
  if (revokedAt) return "revoked";
  if (expiresAt.getTime() <= Date.now()) return "expired";
  return "valid";
}
