import { desc, eq, sql } from "drizzle-orm";
import { db, rawCount, rawRows } from "@/lib/db";
import { registers } from "@/lib/db/schema";
import { recentActivity } from "@/server/activity";
import { roleCapabilities } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";

export type DashboardData = {
  registerCount: number;
  recordCount: number;
  activeUsers: number;
  pendingInvitations: number;
  runningImports: number;
  topRegisters: {
    id: string;
    name: string;
    slug: string;
    recordCount: number;
    fieldCount: number;
    updatedAt: Date;
  }[];
  recent: Awaited<ReturnType<typeof recentActivity>>;
  canSeeUsers: boolean;
  canSeeActivity: boolean;
};

export async function loadDashboard(role: Role, userId: string): Promise<DashboardData> {
  const capabilities = roleCapabilities(role);

  const [registerCount, recordCount, activeUsers, pendingInvitations, runningImports] =
    await Promise.all([
      rawCount(sql`SELECT COUNT(*) AS count FROM registers WHERE status = 'active'`),
      rawCount(sql`SELECT COALESCE(SUM(record_count), 0) AS count FROM registers`),
      rawCount(sql`SELECT COUNT(*) AS count FROM users WHERE status = 'active'`),
      rawCount(
        sql`SELECT COUNT(*) AS count FROM invitations WHERE status = 'pending' AND expires_at > NOW(3)`,
      ),
      rawCount(
        sql`SELECT COUNT(*) AS count FROM import_jobs WHERE status IN ('draft', 'pending', 'processing')`,
      ),
    ]);

  const topRows = await db
    .select({
      id: registers.id,
      name: registers.name,
      slug: registers.slug,
      recordCount: registers.recordCount,
      updatedAt: registers.updatedAt,
    })
    .from(registers)
    .where(eq(registers.status, "active"))
    .orderBy(desc(registers.recordCount), desc(registers.updatedAt))
    .limit(5);

  const fieldCounts = topRows.length
    ? await rawRows<{ register_id: string; total: number }>(
        sql`SELECT register_id, COUNT(*) AS total FROM register_fields WHERE register_id IN (${sql.join(
          topRows.map((row) => sql`${row.id}`),
          sql`, `,
        )}) GROUP BY register_id`,
      )
    : [];
  const fieldCountByRegister = new Map(fieldCounts.map((row) => [row.register_id, Number(row.total)]));

  const recent = await recentActivity(8);

  void userId;

  return {
    registerCount,
    recordCount,
    activeUsers,
    pendingInvitations,
    runningImports,
    topRegisters: topRows.map((row) => ({
      ...row,
      fieldCount: fieldCountByRegister.get(row.id) ?? 0,
    })),
    recent,
    canSeeUsers: capabilities.includes("users:read"),
    canSeeActivity: capabilities.includes("activity:read"),
  };
}
