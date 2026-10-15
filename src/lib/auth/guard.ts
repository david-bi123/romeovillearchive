import { and, eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  registerAccess,
  registerFields,
  registers,
  type Register,
  type RegisterField,
} from "@/lib/db/schema";
import { getAppBaseUrl } from "@/lib/env";
import { getSession, type Session } from "./session";
import { roleHasCapability, type Capability } from "./rbac";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 = 400,
    public readonly code: string = "bad_request",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError(message, 403, "forbidden");

export const notFound = (message = "Not found.") => new AppError(message, 404, "not_found");

export const unauthorized = (message = "Your session has expired. Please sign in again.") =>
  new AppError(message, 401, "unauthorized");

/** Server-side authentication gate for pages. Redirects anonymous visitors. */
export async function requireSession(next?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const target = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    redirect(target);
  }
  return session;
}

/** Server-side authentication gate for server actions / route handlers. */
export async function requireSessionOrThrow(): Promise<Session> {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session;
}

export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await requireSessionOrThrow();
  if (!roleHasCapability(session.user.role, capability)) {
    throw forbidden(`Your role does not allow ${capability}.`);
  }
  return session;
}

/* ------------------------- register level access ------------------------- */

export type RegisterPermissions = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  import: boolean;
  export: boolean;
};

export type RegisterAccessResult = {
  register: Register;
  fields: RegisterField[];
  permissions: RegisterPermissions;
};

/**
 * Loads a register together with its fields and the caller's effective
 * permissions. Explicit `register_access` rows override role defaults; the
 * super administrator always has full access.
 */
export async function getRegisterAccess(
  registerId: string,
  session: Session,
): Promise<RegisterAccessResult | null> {
  const rows = await db
    .select()
    .from(registers)
    .where(and(eq(registers.id, registerId), eq(registers.status, "active")))
    .limit(1);

  const register = rows[0];
  if (!register) return null;

  const fields = await db
    .select()
    .from(registerFields)
    .where(eq(registerFields.registerId, registerId))
    .orderBy(registerFields.displayOrder, registerFields.id);

  const permissions = await resolvePermissions(registerId, session);

  return { register, fields, permissions };
}

/**
 * Loads a register for a protected page or server action: authenticates the
 * session, 404s when the register is missing/inaccessible, 403s when an
 * explicit permission is required. Returns the access payload plus the session
 * so callers can pass it to the server-layer functions directly.
 */
export async function requireRegisterAccess(
  registerId: string,
  permission?: keyof RegisterPermissions,
): Promise<RegisterAccessResult & { session: Session }> {
  const session = await requireSessionOrThrow();
  const access = await getRegisterAccess(registerId, session);
  if (!access) throw notFound("Register not found.");
  if (permission && !access.permissions[permission]) {
    throw forbidden("You do not have permission to view this register.");
  }
  return { ...access, session };
}

export async function resolvePermissions(
  registerId: string,
  session: Session,
): Promise<RegisterPermissions> {
  const role = session.user.role;
  if (role === "super_admin") {
    return { view: true, create: true, edit: true, delete: true, import: true, export: true };
  }

  const grants = await db
    .select()
    .from(registerAccess)
    .where(
      and(
        eq(registerAccess.registerId, registerId),
        or(eq(registerAccess.targetType, "user"), eq(registerAccess.targetType, "role")),
      ),
    );

  const userGrant = grants.find(
    (g) => g.targetType === "user" && g.targetId === session.user.id,
  );
  const roleGrant = grants.find((g) => g.targetType === "role" && g.targetId === role);

  // Explicit user grant wins over role grant; when no grant exists the role
  // defaults from the RBAC table apply.
  const explicit = userGrant ?? roleGrant;
  if (explicit) {
    return {
      view: explicit.canView,
      create: explicit.canCreate,
      edit: explicit.canEdit,
      delete: explicit.canDelete,
      import: explicit.canImport,
      export: explicit.canExport,
    };
  }

  return {
    view: roleHasCapability(role, "records:view"),
    create: roleHasCapability(role, "records:create"),
    edit: roleHasCapability(role, "records:edit"),
    delete: roleHasCapability(role, "records:delete"),
    import: roleHasCapability(role, "records:import"),
    export: roleHasCapability(role, "records:export"),
  };
}

export function assertPermission(permissions: RegisterPermissions, key: keyof RegisterPermissions) {
  if (!permissions[key]) {
    throw forbidden("You do not have permission to perform this action on this register.");
  }
}

/* --------------------------- request hardening --------------------------- */

/**
 * Origin check for non-Server-Action endpoints (route handlers). Server Actions
 * already get an Origin/Host CSRF check from Next.js.
 */
export function assertSameOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return; // no origin header (same-origin GET-like request)

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const configuredHost = new URL(getAppBaseUrl()).host;
      if (originHost !== host && originHost !== configuredHost) {
        throw forbidden("Cross-origin request rejected.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw forbidden("Invalid request origin.");
    }
  }
}
