import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db, rawRows } from "@/lib/db";
import { type Role } from "@/lib/db/schema";
import { AppError } from "@/lib/auth/guard";

/**
 * Shared helpers and types used by server actions and by the server pages that
 * call them. This module deliberately has no "use server" directive: Next.js
 * only permits async function exports from action modules, so the sync pieces
 * (ActionState, toActionState, safeNextPath) and plain data accessors live
 * here instead.
 */

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  redirectTo?: string;
  code?: string;
};

export const IDLE_ACTION_STATE: ActionState = { ok: false };

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    null;
  return { ip, userAgent: headerStore.get("user-agent")?.slice(0, 400) ?? null };
}

/** Only same-site absolute paths are ever used as post-login destinations. */
export function safeNextPath(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  return value;
}

export async function readSetting(key: string): Promise<string | null> {
  const rows = await rawRows<{ value: string | null }>(
    sql`SELECT \`value\` FROM settings WHERE \`key\` = ${key} LIMIT 1`,
  );
  return rows[0]?.value ?? null;
}

export async function writeSetting(key: string, value: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO settings (\`key\`, \`value\`) VALUES (${key}, ${value})
        ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
  );
}

export function toActionState(error: unknown): ActionState {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 429) return { ok: false, message: error.message };
    console.error("[action] unexpected failure", error.message);
    return {
      ok: false,
      message: "Something went wrong. Please try again — if it keeps happening, contact your administrator.",
    };
  }
  return IDLE_ACTION_STATE;
}

/* --------------------------------- schemas -------------------------------- */

const ROLES: [Role, ...Role[]] = ["viewer", "editor", "admin", "super_admin"];

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  role: z.enum(ROLES),
  fullName: z.string().trim().max(160).optional().nullable(),
  message: z.string().trim().max(1000).optional().nullable(),
});

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  fullName: z.string().trim().max(160).optional(),
});

export const securitySettingsSchema = z.object({
  allowAdminInvitations: z.boolean(),
  sessionIdleDays: z.number().int().min(1).max(90),
});
