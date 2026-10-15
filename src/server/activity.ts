import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, rawCount, rawRows } from "@/lib/db";
import { auditLogs, type AuditLog } from "@/lib/db/schema";

export type ActivityQuery = {
  actorUserId?: string | null;
  registerId?: string | null;
  action?: string | null;
  entityType?: string | null;
  from?: Date | null;
  to?: Date | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
};

export type ActivityPage = {
  items: (AuditLog & { actorName: string | null })[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function buildWhere(query: ActivityQuery): SQL[] {
  const clauses: SQL[] = [];
  if (query.actorUserId) clauses.push(eq(auditLogs.actorUserId, query.actorUserId));
  if (query.registerId) clauses.push(eq(auditLogs.registerId, query.registerId));
  if (query.action) clauses.push(eq(auditLogs.action, query.action));
  if (query.entityType) clauses.push(eq(auditLogs.entityType, query.entityType));
  if (query.from) clauses.push(gte(auditLogs.createdAt, query.from));
  if (query.to) clauses.push(lte(auditLogs.createdAt, query.to));
  if (query.search) {
    const term = `%${query.search.replace(/[%_\\]/g, "\\$&")}%`;
    clauses.push(
      sql`(${auditLogs.summary} LIKE ${term} OR ${auditLogs.actorEmail} LIKE ${term} OR ${auditLogs.actorUserId} IN (SELECT id FROM users WHERE full_name LIKE ${term} OR email LIKE ${term}))`,
    );
  }
  return clauses;
}

export async function listActivity(query: ActivityQuery = {}): Promise<ActivityPage> {
  const pageSize = [25, 50, 100].includes(query.pageSize ?? 25) ? (query.pageSize ?? 25) : 25;
  const page = Math.max(1, query.page ?? 1);
  const clauses = buildWhere(query);
  const where = clauses.length ? and(...clauses) : undefined;

  const total = await rawCount(
    sql`SELECT COUNT(*) AS count FROM audit_logs${where ? sql` WHERE ${where}` : sql``}`,
  );

  const offset = (page - 1) * pageSize;
  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const nameRows = await rawRows<{ id: string; full_name: string | null }>(
      sql`SELECT id, full_name FROM users WHERE id IN (${sql.join(
        actorIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
    for (const row of nameRows) names.set(row.id, row.full_name ?? "");
  }

  return {
    items: rows.map((row) => ({
      ...row,
      actorName: row.actorUserId ? names.get(row.actorUserId) ?? null : null,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function recentActivity(limit = 8): Promise<ActivityPage> {
  return listActivity({ page: 1, pageSize: limit });
}

/** Distinct action names present in the trail, for the activity filter menu. */
export async function listActivityActions(): Promise<string[]> {
  const rows = await rawRows<{ action: string }>(
    sql`SELECT DISTINCT action FROM audit_logs ORDER BY action ASC LIMIT 200`,
  );
  return rows.map((row) => row.action);
}
