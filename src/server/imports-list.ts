import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { importJobs, registerAccess, registers, type ImportJob, type Register } from "@/lib/db/schema";
import { listRegisters } from "@/server/registers";
import { roleHasCapability } from "@/lib/auth/rbac";
import type { Session } from "@/lib/auth/session";

export type ImportJobListItem = {
  id: ImportJob["id"];
  kind: ImportJob["kind"];
  status: ImportJob["status"];
  filename: ImportJob["filename"];
  targetRegisterId: ImportJob["targetRegisterId"];
  registerName: string | null;
  progress: ImportJob["progress"];
  rowsTotal: ImportJob["rowsTotal"];
  rowsImported: ImportJob["rowsImported"];
  rowsUpdated: ImportJob["rowsUpdated"];
  rowsSkipped: ImportJob["rowsSkipped"];
  rowsRejected: ImportJob["rowsRejected"];
  errorMessage: ImportJob["errorMessage"];
  createdByUserId: ImportJob["createdByUserId"];
  createdAt: ImportJob["createdAt"];
  finishedAt: ImportJob["finishedAt"];
};

export type ImportJobListPage = {
  items: ImportJobListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * Lists import jobs the caller is allowed to see, using the same visibility
 * rule as `loadImportJobForSession`: a user sees their own jobs, while an
 * administrator sees every job. Ordered newest first, paginated.
 */
export async function listImportJobsForUser(
  session: Session,
  opts: { page?: number; pageSize?: number } = {},
): Promise<ImportJobListPage> {
  const pageSize = Math.min(Math.max(1, Math.floor(opts.pageSize ?? 20)), 100);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * pageSize;

  const isStaff = session.user.role === "super_admin" || session.user.role === "admin";
  const where = isStaff ? undefined : eq(importJobs.createdByUserId, session.user.id);

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(importJobs)
    .where(where);

  const rows = await db
    .select({
      id: importJobs.id,
      kind: importJobs.kind,
      status: importJobs.status,
      filename: importJobs.filename,
      targetRegisterId: importJobs.targetRegisterId,
      jobRegisterName: importJobs.targetRegisterName,
      registerName: registers.name,
      progress: importJobs.progress,
      rowsTotal: importJobs.rowsTotal,
      rowsImported: importJobs.rowsImported,
      rowsUpdated: importJobs.rowsUpdated,
      rowsSkipped: importJobs.rowsSkipped,
      rowsRejected: importJobs.rowsRejected,
      errorMessage: importJobs.errorMessage,
      createdByUserId: importJobs.createdByUserId,
      createdAt: importJobs.createdAt,
      finishedAt: importJobs.finishedAt,
    })
    .from(importJobs)
    .leftJoin(registers, eq(importJobs.targetRegisterId, registers.id))
    .where(where)
    .orderBy(desc(importJobs.createdAt), desc(importJobs.id))
    .limit(pageSize)
    .offset(offset);

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      filename: row.filename,
      targetRegisterId: row.targetRegisterId,
      registerName: row.registerName ?? row.jobRegisterName,
      progress: row.progress,
      rowsTotal: row.rowsTotal,
      rowsImported: row.rowsImported,
      rowsUpdated: row.rowsUpdated,
      rowsSkipped: row.rowsSkipped,
      rowsRejected: row.rowsRejected,
      errorMessage: row.errorMessage,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    })),
    total: Number(count ?? 0),
    page,
    pageSize,
  };
}

/**
 * Active registers the caller may import into, resolved with the same
 * precedence as `resolvePermissions`: an explicit user grant wins over a role
 * grant, and when no grant exists the role's `records:import` capability
 * applies. Grants are loaded in one batched query.
 */
export async function listImportableRegisters(session: Session): Promise<Register[]> {
  const all = await listRegisters();
  if (all.length === 0) return [];
  if (session.user.role === "super_admin") return all;

  const grants = await db
    .select()
    .from(registerAccess)
    .where(
      sql`${registerAccess.registerId} IN (${sql.join(
        all.map((register) => sql`${register.id}`),
        sql`, `,
      )})`,
    );

  const capabilityAllows = roleHasCapability(session.user.role, "records:import");

  return all.filter((register) => {
    const userGrant = grants.find(
      (grant) =>
        grant.registerId === register.id &&
        grant.targetType === "user" &&
        grant.targetId === session.user.id,
    );
    const roleGrant = grants.find(
      (grant) =>
        grant.registerId === register.id &&
        grant.targetType === "role" &&
        grant.targetId === session.user.role,
    );
    const explicit = userGrant ?? roleGrant;
    if (explicit) return explicit.canImport;
    return capabilityAllows;
  });
}
