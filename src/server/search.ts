import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, rawCount } from "@/lib/db";
import {
  registerAccess,
  registerFields,
  registers,
  records,
  recordValues,
  type FieldType,
  type RegisterField,
} from "@/lib/db/schema";
import { roleHasCapability } from "@/lib/auth/rbac";
import type { Session } from "@/lib/auth/session";
import { emptySlot, type ValueSlot } from "@/lib/field-values";
import { escapeLike, summarizeValues } from "@/server/records";

export const SEARCH_GROUP_LIMIT = 20;

export type SearchRegisterHit = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  recordCount: number;
  updatedAt: Date;
};

export type SearchRecordHit = {
  id: string;
  serial: number;
  registerId: string;
  registerName: string;
  updatedAt: Date;
  context: { label: string; value: string }[];
};

export type SearchGroup<T> = {
  items: T[];
  total: number;
};

export type GlobalSearchResult = {
  query: string;
  registers: SearchGroup<SearchRegisterHit>;
  records: SearchGroup<SearchRecordHit>;
};

function emptyResult(query: string): GlobalSearchResult {
  return { query, registers: { items: [], total: 0 }, records: { items: [], total: 0 } };
}

/**
 * Applies the same visibility rules as `resolvePermissions`: an explicit user
 * grant wins over a role grant, and registers without any grant fall back to
 * the role's default `records:view` capability. The super administrator sees
 * every register.
 */
async function filterViewable<T extends { id: string }>(list: T[], session: Session): Promise<T[]> {
  if (list.length === 0) return list;
  if (session.user.role === "super_admin") return list;

  const grants = await db
    .select()
    .from(registerAccess)
    .where(
      and(
        inArray(
          registerAccess.registerId,
          list.map((item) => item.id),
        ),
        or(
          and(eq(registerAccess.targetType, "user"), eq(registerAccess.targetId, session.user.id)),
          and(eq(registerAccess.targetType, "role"), eq(registerAccess.targetId, session.user.role)),
        ),
      ),
    );

  const grantsByRegister = new Map<string, typeof grants>();
  for (const grant of grants) {
    const bucket = grantsByRegister.get(grant.registerId) ?? [];
    bucket.push(grant);
    grantsByRegister.set(grant.registerId, bucket);
  }

  const defaultCanView = roleHasCapability(session.user.role, "records:view");

  return list.filter((item) => {
    const rows = grantsByRegister.get(item.id) ?? [];
    const userGrant = rows.find((row) => row.targetType === "user");
    const roleGrant = rows.find((row) => row.targetType === "role");
    const explicit = userGrant ?? roleGrant;
    return explicit ? explicit.canView : defaultCanView;
  });
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function slotFromValueRow(
  type: FieldType,
  row: typeof recordValues.$inferSelect,
): ValueSlot {
  const slot = emptySlot();
  switch (type) {
    case "integer":
    case "decimal":
      slot.valueNumber = row.valueNumber;
      break;
    case "date":
    case "datetime":
      slot.valueDate = row.valueDate;
      break;
    case "boolean":
      slot.valueBoolean = row.valueBoolean;
      break;
    case "multi_select":
      slot.valueJson = Array.isArray(row.valueJson)
        ? (row.valueJson as string[])
        : typeof row.valueJson === "string"
          ? parseJsonArray(row.valueJson)
          : null;
      break;
    default:
      slot.valueText = row.valueText;
  }
  return slot;
}

async function searchRecords(
  query: string,
  registerIds: string[],
): Promise<SearchGroup<SearchRecordHit>> {
  if (registerIds.length === 0) return { items: [], total: 0 };

  const term = `%${escapeLike(query)}%`;
  const clauses: SQL[] = [
    inArray(records.registerId, registerIds),
    eq(records.status, "active"),
    isNull(records.deletedAt),
    sql`records.search_text LIKE ${term}`,
  ];
  const where = and(...clauses);

  const total = await rawCount(
    sql`SELECT COUNT(*) AS count FROM records WHERE ${where}`,
  );
  if (total === 0) return { items: [], total: 0 };

  const rows = await db
    .select({
      id: records.id,
      serial: records.serial,
      registerId: records.registerId,
      updatedAt: records.updatedAt,
      registerName: registers.name,
    })
    .from(records)
    .innerJoin(registers, eq(records.registerId, registers.id))
    .where(where)
    .orderBy(desc(records.updatedAt))
    .limit(SEARCH_GROUP_LIMIT);

  if (rows.length === 0) return { items: [], total };

  const fieldRows = await db
    .select()
    .from(registerFields)
    .where(
      inArray(
        registerFields.registerId,
        [...new Set(rows.map((row) => row.registerId))],
      ),
    )
    .orderBy(asc(registerFields.displayOrder), asc(registerFields.id));

  const valueRows = await db
    .select()
    .from(recordValues)
    .where(inArray(recordValues.recordId, rows.map((row) => row.id)));

  const fieldById = new Map(fieldRows.map((field) => [field.id, field]));
  const fieldsByRegister = new Map<string, RegisterField[]>();
  for (const field of fieldRows) {
    const bucket = fieldsByRegister.get(field.registerId) ?? [];
    bucket.push(field);
    fieldsByRegister.set(field.registerId, bucket);
  }

  const valuesByRecord = new Map<string, Record<string, ValueSlot>>();
  for (const row of valueRows) {
    const field = fieldById.get(row.fieldId);
    if (!field) continue;
    let bucket = valuesByRecord.get(row.recordId);
    if (!bucket) {
      bucket = {};
      valuesByRecord.set(row.recordId, bucket);
    }
    bucket[field.id] = slotFromValueRow(field.fieldType, row);
  }

  const items: SearchRecordHit[] = rows.map((row) => {
    const fields = fieldsByRegister.get(row.registerId) ?? [];
    const summary = summarizeValues(fields, valuesByRecord.get(row.id) ?? {});
    const context = Object.entries(summary)
      .slice(0, 2)
      .map(([label, value]) => ({ label, value }));
    return {
      id: row.id,
      serial: Number(row.serial),
      registerId: row.registerId,
      registerName: row.registerName,
      updatedAt: row.updatedAt,
      context,
    };
  });

  return { items, total };
}

/**
 * Grouped, read only search across registers and records. Results never
 * exceed `SEARCH_GROUP_LIMIT` items per group while `total` reports the full
 * match count, and both groups are restricted to registers the caller can
 * actually open.
 */
export async function globalSearch(
  rawQuery: string,
  session: Session,
): Promise<GlobalSearchResult> {
  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!query) return emptyResult("");

  const term = `%${escapeLike(query)}%`;
  const candidates = await db
    .select({
      id: registers.id,
      name: registers.name,
      description: registers.description,
      category: registers.category,
      recordCount: registers.recordCount,
      updatedAt: registers.updatedAt,
    })
    .from(registers)
    .where(
      and(
        eq(registers.status, "active"),
        sql`(${registers.name} LIKE ${term} OR ${registers.description} LIKE ${term} OR ${registers.category} LIKE ${term})`,
      ),
    )
    .orderBy(desc(registers.updatedAt), asc(registers.name));

  const viewable = await filterViewable(candidates, session);

  const registerGroup: SearchGroup<SearchRegisterHit> = {
    items: viewable.slice(0, SEARCH_GROUP_LIMIT),
    total: viewable.length,
  };
  const recordGroup = await searchRecords(
    query,
    viewable.map((register) => register.id),
  );

  return { query, registers: registerGroup, records: recordGroup };
}
