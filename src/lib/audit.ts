import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { generateRequestId } from "./auth/tokens";

/**
 * Append-only audit trail.
 *
 * Secrets (passwords, tokens, hashes) are scrubbed before anything is written
 * so a leaked audit export can never be used to recover credentials. Staff have
 * no UI or API surface that mutates or deletes these rows.
 */

const SECRET_KEY_PATTERN =
  /(password|passwd|token|secret|hash|authorization|cookie|credential|api[_-]?key|session)/i;

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  registerId?: string | null;
  summary?: string;
  metadata?: Record<string, unknown> | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  requestId?: string | null;
};

export function scrubMetadata(input: unknown, depth = 0): unknown {
  if (depth > 4 || input === null || input === undefined) return null;
  if (Array.isArray(input)) return input.slice(0, 50).map((item) => scrubMetadata(item, depth + 1));
  if (input instanceof Date) return input.toISOString();
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = scrubMetadata(value, depth + 1);
      }
    }
    return out;
  }
  if (typeof input === "string") return input.length > 2000 ? `${input.slice(0, 2000)}…` : input;
  return input;
}

/**
 * Writes an audit event. Never throws: a failed audit write must not roll back
 * the business operation it describes, but it is reported to the server log.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail?.slice(0, 255) ?? null,
      action: input.action.slice(0, 80),
      entityType: input.entityType.slice(0, 60),
      entityId: input.entityId?.slice(0, 64) ?? null,
      registerId: input.registerId?.slice(0, 64) ?? null,
      summary: input.summary?.slice(0, 400) ?? null,
      metadata: (scrubMetadata(input.metadata ?? null) as never) ?? null,
      ip: input.ip?.slice(0, 64) ?? null,
      requestId: input.requestId ?? generateRequestId(),
    });
  } catch (error) {
    console.error(
      "[audit] failed to persist event",
      { action: input.action, entityType: input.entityType },
      error instanceof Error ? error.message : error,
    );
  }
}

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGOUT: "auth.logout",
  PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",
  PASSWORD_CHANGED: "auth.password.changed",
  ACTIVATION_REQUESTED: "auth.activation.requested",
  ACTIVATION_COMPLETED: "auth.activation.completed",
  INVITATION_CREATED: "invitation.created",
  INVITATION_RESENT: "invitation.resent",
  INVITATION_REVOKED: "invitation.revoked",
  INVITATION_ACCEPTED: "invitation.accepted",
  USER_ROLE_CHANGED: "user.role_changed",
  USER_DISABLED: "user.disabled",
  USER_ENABLED: "user.enabled",
  USER_SESSIONS_REVOKED: "user.sessions_revoked",
  USER_PROFILE_UPDATED: "user.profile_updated",
  REGISTER_CREATED: "register.created",
  REGISTER_UPDATED: "register.updated",
  REGISTER_ARCHIVED: "register.archived",
  REGISTER_RESTORED: "register.restored",
  REGISTER_DELETED: "register.deleted",
  FIELD_ADDED: "field.added",
  FIELD_UPDATED: "field.updated",
  FIELD_DELETED: "field.deleted",
  RECORD_CREATED: "record.created",
  RECORD_UPDATED: "record.updated",
  RECORD_DELETED: "record.deleted",
  RECORD_RESTORED: "record.restored",
  RECORDS_BULK_DELETED: "records.bulk_deleted",
  RECORDS_BULK_UPDATED: "records.bulk_updated",
  RECORDS_EXPORTED: "records.exported",
  IMPORT_CREATED: "import.created",
  IMPORT_STARTED: "import.started",
  IMPORT_COMPLETED: "import.completed",
  IMPORT_FAILED: "import.failed",
  IMPORT_CANCELLED: "import.cancelled",
  ACCESS_GRANT_CHANGED: "register_access.changed",
  SETTING_CHANGED: "settings.changed",
  BOOTSTRAP_INVITATION_CREATED: "bootstrap.invitation_created",
} as const;
