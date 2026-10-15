import { ROLES, type Role } from "@/lib/db/schema";

/**
 * Role based access control.
 *
 * Every capability check in this file is executed on the server. The client
 * only ever receives already-filtered data; hiding a button is a courtesy, not
 * a security boundary.
 */

export const CAPABILITIES = [
  // system scope
  "users:read",
  "users:invite",
  "users:manage",
  "settings:manage",
  "audit:read",
  "activity:read",
  "registers:create",
  "registers:update",
  "registers:archive",
  "registers:delete",
  // per-register scope (also stored in register_access)
  "records:view",
  "records:create",
  "records:edit",
  "records:delete",
  "records:import",
  "records:export",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Default capabilities granted by role when a register has no explicit
 * `register_access` row. Explicit register grants always win.
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  super_admin: [...CAPABILITIES],
  admin: [
    "users:read",
    "users:invite",
    "users:manage",
    "audit:read",
    "activity:read",
    "registers:create",
    "registers:update",
    "registers:archive",
    "records:view",
    "records:create",
    "records:edit",
    "records:delete",
    "records:import",
    "records:export",
  ],
  editor: ["activity:read", "records:view", "records:create", "records:edit", "records:export"],
  viewer: ["records:view"],
};

const capabilitiesFor = new Map<Role, Set<Capability>>([
  ["super_admin", new Set(ROLE_CAPABILITIES.super_admin)],
  ["admin", new Set(ROLE_CAPABILITIES.admin)],
  ["editor", new Set(ROLE_CAPABILITIES.editor)],
  ["viewer", new Set(ROLE_CAPABILITIES.viewer)],
]);

export function roleHasCapability(role: Role, capability: Capability): boolean {
  if (role === "super_admin") return true;
  return capabilitiesFor.get(role)?.has(capability) ?? false;
}

export function roleCapabilities(role: Role): Capability[] {
  return [...(capabilitiesFor.get(role) ?? new Set())];
}

/** Roles that may never be assigned to themselves via a manipulated request. */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return targetRole === "admin" || targetRole === "editor" || targetRole === "viewer";
  return false;
}

export function canManageUser(actorRole: Role, targetRole: Role, targetIsSelf: boolean): boolean {
  if (targetIsSelf) return false; // nobody edits their own role/status here
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return targetRole !== "super_admin";
  return false;
}

/** The super administrator can never be demoted, disabled or deleted. */
export function isProtectedSuperAdmin(actorRole: Role, targetRole: Role): boolean {
  return targetRole === "super_admin" && actorRole !== "super_admin";
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Administrator",
  admin: "Administrator",
  editor: "Editor",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin:
    "Full access to every register, user, import, export, audit log and system setting. The account cannot be demoted or disabled.",
  admin:
    "Manages registers and records, can invite staff when enabled, and reviews activity. Cannot change the super administrator.",
  editor: "Creates and edits records in permitted registers, exports data, and may import when granted.",
  viewer: "Reads and searches permitted registers. Export is only possible when explicitly granted.",
};

export function isRole(value: unknown): value is Role {
  // `ROLES.includes` is used rather than a Map lookup: `in` would also match
  // inherited Object.prototype keys such as "__proto__".
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
