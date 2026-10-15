import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { affectedCount, db, rawCount, rawRows } from "@/lib/db";
import {
  registerFields,
  registers,
  records,
  recordValues,
  type RegisterField,
  type RecordRow,
} from "@/lib/db/schema";
import {
  emptySlot,
  formatSlotForDisplay,
  parseDateValue,
  slotToPlainString,
  validateRecordValues,
  type ValueSlot,
} from "@/lib/field-values";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import type { Session } from "@/lib/auth/session";
import { AppError } from "@/lib/auth/guard";
import type { FieldType } from "@/lib/db/schema";

/* --------------------------------- types --------------------------------- */

export type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "not_empty";

export type FilterClause = {
  fieldId: string;
  op: FilterOp;
  value?: string;
  value2?: string;
};

export type SortClause = {
  /** Either a register field id, or a record meta column key. */
  key: string;
  dir: "asc" | "desc";
};

export type RecordQuery = {
  registerId: string;
  page?: number;
  pageSize?: number;
  sort?: SortClause | null;
  filters?: FilterClause[];
  search?: string;
  includeArchived?: boolean;
};

export type RecordListItem = {
  id: string;
  serial: number;
  status: "active" | "archived";
  dataVersion: number;
  createdAt: Date;
  updatedAt: Date;
  values: Record<string, ValueSlot>;
};

export type RecordPage = {
  items: RecordListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export const PAGE_SIZES = [25, 50, 100, 200] as const;

const META_SORT_KEYS = new Set(["serial", "createdAt", "updatedAt", "status"]);

/* ------------------------------- helpers -------------------------------- */

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function valueColumnForType(type: FieldType): SQL {
  switch (type) {
    case "integer":
    case "decimal":
      return sql`value_number`;
    case "date":
    case "datetime":
      return sql`value_date`;
    case "boolean":
      return sql`value_boolean`;
    case "multi_select":
      return sql`value_json`;
    default:
      return sql`value_text`;
  }
}

function normalizeSortValue(type: FieldType, raw: string | undefined): unknown {
  if (raw === undefined || raw === "") return null;
  switch (type) {
    case "integer":
    case "decimal": {
      const parsed = Number(String(raw).replace(/,/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    case "date":
    case "datetime":
      return parseDateValue(raw).date;
    case "boolean":
      return ["true", "yes", "1", "on"].includes(String(raw).toLowerCase());
    default:
      return raw;
  }
}

function buildFilterSql(filter: FilterClause, field: RegisterField): SQL | null {
  const column = valueColumnForType(field.fieldType);
  const base = sql`EXISTS (SELECT 1 FROM record_values rv WHERE rv.record_id = records.id AND rv.field_id = ${field.id}`;

  switch (filter.op) {
    case "empty":
      return sql`${base} AND rv.${column} IS NULL)`;
    case "not_empty":
      return sql`${base} AND rv.${column} IS NOT NULL)`;
    case "eq": {
      const value = normalizeSortValue(field.fieldType, filter.value);
      if (value === null) return null;
      return sql`${base} AND rv.${column} = ${value})`;
    }
    case "neq": {
      const value = normalizeSortValue(field.fieldType, filter.value);
      if (value === null) return null;
      return sql`${base} AND (rv.${column} IS NULL OR rv.${column} <> ${value})`;
    }
    case "contains": {
      if (!filter.value) return null;
      return sql`${base} AND rv.${column} LIKE ${`%${escapeLike(filter.value)}%`})`;
    }
    case "not_contains": {
      if (!filter.value) return null;
      return sql`${base} AND rv.${column} NOT LIKE ${`%${escapeLike(filter.value)}%`})`;
    }
    case "starts": {
      if (!filter.value) return null;
      return sql`${base} AND rv.${column} LIKE ${`${escapeLike(filter.value)}%`})`;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const value = normalizeSortValue(field.fieldType, filter.value);
      if (value === null) return null;
      const operator = filter.op === "gt" ? ">" : filter.op === "gte" ? ">=" : filter.op === "lt" ? "<" : "<=";
      return sql`${base} AND rv.${column} ${sql.raw(operator)} ${value})`;
    }
    default:
      return null;
  }
}

async function buildWhere(
  query: RecordQuery,
  fields: RegisterField[],
): Promise<SQL[]> {
  const clauses: SQL[] = [eq(records.registerId, query.registerId)];

  if (!query.includeArchived) {
    clauses.push(eq(records.status, "active"));
    clauses.push(isNull(records.deletedAt));
  }

  const search = query.search?.trim();
  if (search) {
    clauses.push(
      sql`records.search_text LIKE ${`%${escapeLike(search)}%`}`,
    );
  }

  const byField = new Map(fields.map((field) => [field.id, field]));
  for (const filter of query.filters ?? []) {
    const field = byField.get(filter.fieldId);
    if (!field) continue;
    const sqlClause = buildFilterSql(filter, field);
    if (sqlClause) clauses.push(sqlClause);
  }

  return clauses;
}

function buildOrderBy(query: RecordQuery, fields: RegisterField[]): SQL {
  const sort = query.sort;
  if (!sort) return sql`records.updated_at DESC`;

  const dir = sort.dir === "asc" ? sql`ASC` : sql`DESC`;

  if (META_SORT_KEYS.has(sort.key)) {
    const column =
      sort.key === "serial"
        ? sql`records.serial`
        : sort.key === "createdAt"
          ? sql`records.created_at`
          : sort.key === "status"
            ? sql`records.status`
            : sql`records.updated_at`;
    return sql`ORDER BY ${column} ${dir}`;
  }

  const field = fields.find((candidate) => candidate.id === sort.key);
  if (!field) return sql`records.updated_at DESC`;

  const column = valueColumnForType(field.fieldType);
  const sub = sql`(SELECT rv.${column} FROM record_values rv WHERE rv.record_id = records.id AND rv.field_id = ${field.id} LIMIT 1)`;
  // COALESCE-wrap the bare value term: the TiDB Cloud gateway miscompiles a
  // repeated correlated scalar subquery in ORDER BY ("Column 'id' ... is
  // ambiguous"). Null rows are already grouped by the leading IS NULL term,
  // so the fallback only equalises ties inside that group.
  const zero =
    field.fieldType === "integer" || field.fieldType === "decimal" || field.fieldType === "boolean"
      ? sql`0`
      : field.fieldType === "date" || field.fieldType === "datetime"
        ? sql`'1970-01-01'`
        : sql`''`;
  return sql`ORDER BY ${sub} IS NULL ASC, COALESCE(${sub}, ${zero}) ${dir}, records.serial ASC`;
}

function slotFromRow(
  type: FieldType,
  row: {
    valueText: string | null;
    valueNumber: number | null;
    valueDate: Date | null;
    valueBoolean: boolean | null;
    valueJson: unknown;
  },
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

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/* -------------------------------- listing -------------------------------- */

export async function listRecords(
  query: RecordQuery,
  fields: RegisterField[],
): Promise<RecordPage> {
  const pageSize = PAGE_SIZES.includes((query.pageSize ?? 50) as (typeof PAGE_SIZES)[number])
    ? (query.pageSize ?? 50)
    : 50;
  const page = Math.max(1, Math.floor(query.page ?? 1));

  const clauses = await buildWhere(query, fields);

  const total = await rawCount(
    sql`SELECT COUNT(*) AS count FROM records WHERE ${sql.join(clauses, sql` AND `)}`,
  );

  const orderBy = buildOrderBy(query, fields);
  const offset = (page - 1) * pageSize;

  const orderSql = query.sort
    ? orderBy
    : sql`ORDER BY records.updated_at DESC, records.serial DESC`;

  const pageRows = await rawRows<{ id: string }>(
    sql`SELECT records.id AS id FROM records WHERE ${sql.join(clauses, sql` AND `)} ${orderSql} LIMIT ${pageSize} OFFSET ${offset}`,
  );

  const ids = pageRows.map((row) => row.id);
  const items: RecordListItem[] = ids.map((id) => ({
    id,
    serial: 0,
    status: "active",
    dataVersion: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    values: {},
  }));

  if (ids.length > 0) {
    const metaRows = await db
      .select()
      .from(records)
      .where(inArray(records.id, ids));
    const metaById = new Map(metaRows.map((row) => [row.id, row]));

    const valueRows = await db
      .select()
      .from(recordValues)
      .where(inArray(recordValues.recordId, ids));

    const fieldById = new Map(fields.map((field) => [field.id, field]));

    const valuesByRecord = new Map<string, Map<string, ValueSlot>>();
    for (const value of valueRows) {
      const field = fieldById.get(value.fieldId);
      if (!field) continue;
      let bucket = valuesByRecord.get(value.recordId);
      if (!bucket) {
        bucket = new Map();
        valuesByRecord.set(value.recordId, bucket);
      }
      bucket.set(field.id, slotFromRow(field.fieldType, value));
    }

    const ordered: RecordListItem[] = [];
    for (const id of ids) {
      const meta = metaById.get(id);
      if (!meta) continue;
      ordered.push({
        id: meta.id,
        serial: Number(meta.serial),
        status: meta.status,
        dataVersion: meta.dataVersion,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        values: Object.fromEntries(valuesByRecord.get(id) ?? []),
      });
    }

    return {
      items: ordered,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/* ------------------------------ single record ---------------------------- */

export type FullRecord = {
  record: RecordRow;
  values: Record<string, ValueSlot>;
};

export async function getRecordById(recordId: string): Promise<FullRecord | null> {
  const rows = await db.select().from(records).where(eq(records.id, recordId)).limit(1);
  const record = rows[0];
  if (!record) return null;

  const valueRows = await db
    .select()
    .from(recordValues)
    .where(eq(recordValues.recordId, recordId));

  const fields = await db
    .select()
    .from(registerFields)
    .where(eq(registerFields.registerId, record.registerId));

  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const values: Record<string, ValueSlot> = {};
  for (const row of valueRows) {
    const field = fieldById.get(row.fieldId);
    if (!field) continue;
    values[field.id] = slotFromRow(field.fieldType, row);
  }

  return { record, values };
}

/* ------------------------------ serial numbers --------------------------- */

/**
 * Allocates the next per-register serial number.
 *
 * Uses an UPDATE followed by a locking read inside the caller's transaction so
 * two concurrent inserts can never receive the same serial.
 */
async function allocateSerial(tx: import("@/lib/db").Database, registerId: string): Promise<number> {
  await tx
    .update(registers)
    .set({ serialCounter: sql`${registers.serialCounter} + 1` })
    .where(eq(registers.id, registerId));

  const rows = await tx
    .select({ serial: registers.serialCounter })
    .from(registers)
    .where(eq(registers.id, registerId))
    .for("update")
    .limit(1);

  const serial = rows[0]?.serial;
  if (serial === undefined || serial === null) {
    throw new AppError("Register could not allocate a record number", 500, "server_error");
  }
  return Number(serial);
}

function buildSearchText(fields: RegisterField[], values: Record<string, ValueSlot>): string {
  const parts: string[] = [];
  for (const field of fields) {
    const slot = values[field.id];
    if (!slot) continue;
    const text = slotToPlainString(field, slot);
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

/* --------------------------------- create -------------------------------- */

export type RecordWriteResult =
  | { ok: true; recordId: string; serial: number }
  | { ok: false; errors: Record<string, string>; message?: string };

export async function createRecord(
  registerId: string,
  fields: RegisterField[],
  input: Record<string, unknown>,
  session: Session,
): Promise<RecordWriteResult> {
  const { slots, errors } = validateRecordValues(fields, input);
  if (errors.length > 0) {
    return {
      ok: false,
      errors: Object.fromEntries(errors.map((error) => [error.fieldId, error.message])),
      message: "Please fix the highlighted fields.",
    };
  }

  const values = Object.fromEntries(fields.map((field, index) => [field.id, slots[index]]));
  const recordId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    const serial = await allocateSerial(tx, registerId);

    await tx.insert(records).values({
      id: recordId,
      registerId,
      serial,
      createdByUserId: session.user.id,
      updatedByUserId: session.user.id,
      searchText: buildSearchText(fields, values),
    });

    const valueRows = fields
      .map((field, index) => ({ field, slot: slots[index] }))
      .filter(({ slot }) => slot !== undefined)
      .filter(({ slot }) => slot.valueText !== null || slot.valueNumber !== null || slot.valueDate !== null || slot.valueBoolean !== null || (slot.valueJson?.length ?? 0) > 0)
      .map(({ field, slot }) => ({
        id: crypto.randomUUID(),
        recordId,
        fieldId: field.id,
        valueText: slot.valueText,
        valueNumber: slot.valueNumber,
        valueDate: slot.valueDate,
        valueBoolean: slot.valueBoolean,
        valueJson: slot.valueJson as never,
      }));

    if (valueRows.length > 0) await tx.insert(recordValues).values(valueRows);

    await tx
      .update(registers)
      .set({ recordCount: sql`${registers.recordCount} + 1` })
      .where(eq(registers.id, registerId));
  });

  await recordAudit({
    action: AUDIT_ACTIONS.RECORD_CREATED,
    entityType: "record",
    entityId: recordId,
    registerId,
    summary: "Created a record",
    metadata: {
      values: summarizeValues(fields, values),
    },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  const serialRows = await db
    .select({ serial: records.serial })
    .from(records)
    .where(eq(records.id, recordId))
    .limit(1);

  return { ok: true, recordId, serial: Number(serialRows[0]?.serial ?? 0) };
}

/* --------------------------------- update -------------------------------- */

/**
 * Updates a record with optimistic concurrency control: `expectedVersion` must
 * equal the record's current `dataVersion`, otherwise the caller is told the
 * record changed while they were editing.
 */
export async function updateRecord(
  recordId: string,
  fields: RegisterField[],
  input: Record<string, unknown>,
  expectedVersion: number,
  session: Session,
): Promise<RecordWriteResult> {
  const { slots, errors } = validateRecordValues(fields, input);
  if (errors.length > 0) {
    return {
      ok: false,
      errors: Object.fromEntries(errors.map((error) => [error.fieldId, error.message])),
      message: "Please fix the highlighted fields.",
    };
  }

  const existing = await db.select().from(records).where(eq(records.id, recordId)).limit(1);
  const record = existing[0];
  if (!record) return { ok: false, errors: {}, message: "Record not found." };

  if (record.dataVersion !== expectedVersion) {
    return {
      ok: false,
      errors: {},
      message:
        "This record was changed by someone else while you were editing. Reload to see the latest version before saving.",
    };
  }

  const values = Object.fromEntries(fields.map((field, index) => [field.id, slots[index]]));
  const nextVersion = record.dataVersion + 1;

  await db.transaction(async (tx) => {
    const result = await tx
      .update(records)
      .set({
        dataVersion: nextVersion,
        updatedByUserId: session.user.id,
        updatedAt: new Date(),
        searchText: buildSearchText(fields, values),
      })
      .where(and(eq(records.id, recordId), eq(records.dataVersion, expectedVersion)));

    // The dataVersion predicate is the concurrency guard: a concurrent editor
    // bumps it first and makes this update match zero rows.
    if (affectedCount(result) === 0) {
      throw new AppError(
        "This record was changed by someone else. Reload and try again.",
        409,
        "version_conflict",
      );
    }

    await tx.delete(recordValues).where(eq(recordValues.recordId, recordId));

    const valueRows = fields
      .map((field, index) => ({ field, slot: slots[index] }))
      .filter(
        ({ slot }) =>
          slot !== undefined &&
          (slot.valueText !== null ||
            slot.valueNumber !== null ||
            slot.valueDate !== null ||
            slot.valueBoolean !== null ||
            (slot.valueJson?.length ?? 0) > 0),
      )
      .map(({ field, slot }) => ({
        id: crypto.randomUUID(),
        recordId,
        fieldId: field.id,
        valueText: slot.valueText,
        valueNumber: slot.valueNumber,
        valueDate: slot.valueDate,
        valueBoolean: slot.valueBoolean,
        valueJson: slot.valueJson as never,
      }));

    if (valueRows.length > 0) await tx.insert(recordValues).values(valueRows);
  });

  await recordAudit({
    action: AUDIT_ACTIONS.RECORD_UPDATED,
    entityType: "record",
    entityId: recordId,
    registerId: record.registerId,
    summary: `Updated record #${record.serial}`,
    metadata: { version: nextVersion, values: summarizeValues(fields, values) },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return { ok: true, recordId, serial: Number(record.serial) };
}

/* --------------------------------- delete -------------------------------- */

export async function archiveRecords(
  recordIds: string[],
  session: Session,
): Promise<{ deleted: number }> {
  if (recordIds.length === 0) return { deleted: 0 };

  const rows = await db
    .select({ id: records.id, serial: records.serial, registerId: records.registerId })
    .from(records)
    .where(inArray(records.id, recordIds));

  if (rows.length === 0) return { deleted: 0 };

  const registerId = rows[0].registerId;
  await db.transaction(async (tx) => {
    await tx
      .update(records)
      .set({ status: "archived", deletedAt: new Date(), updatedByUserId: session.user.id })
      .where(inArray(records.id, rows.map((row) => row.id)));
    await tx
      .update(registers)
      .set({ recordCount: sql`GREATEST(0, ${registers.recordCount} - ${rows.length})` })
      .where(eq(registers.id, registerId));
  });

  await recordAudit({
    action: AUDIT_ACTIONS.RECORDS_BULK_DELETED,
    entityType: "record",
    entityId: rows.map((row) => row.id).join(",").slice(0, 64),
    registerId,
    summary: `Moved ${rows.length} record${rows.length === 1 ? "" : "s"} to the archive`,
    metadata: { recordIds: rows.map((row) => row.id), serials: rows.map((row) => row.serial) },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return { deleted: rows.length };
}

export async function restoreRecords(
  recordIds: string[],
  session: Session,
): Promise<{ restored: number }> {
  if (recordIds.length === 0) return { restored: 0 };

  const rows = await db
    .select({ id: records.id, registerId: records.registerId })
    .from(records)
    .where(inArray(records.id, recordIds));
  if (rows.length === 0) return { restored: 0 };

  const registerId = rows[0].registerId;
  await db.transaction(async (tx) => {
    await tx
      .update(records)
      .set({ status: "active", deletedAt: null, updatedByUserId: session.user.id })
      .where(inArray(records.id, rows.map((row) => row.id)));
    await tx
      .update(registers)
      .set({ recordCount: sql`${registers.recordCount} + ${rows.length}` })
      .where(eq(registers.id, registerId));
  });

  await recordAudit({
    action: AUDIT_ACTIONS.RECORD_RESTORED,
    entityType: "record",
    entityId: rows[0].id,
    registerId,
    summary: `Restored ${rows.length} record${rows.length === 1 ? "" : "s"}`,
    metadata: { recordIds: rows.map((row) => row.id) },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return { restored: rows.length };
}

/* ---------------------------------- bulk --------------------------------- */

export async function bulkSetField(
  recordIds: string[],
  field: RegisterField,
  rawValue: unknown,
  session: Session,
): Promise<{ updated: number }> {
  if (recordIds.length === 0) return { updated: 0 };

  const probe: RegisterField = { ...field, required: false };
  const { coerceValue } = await import("@/lib/field-values");
  const result = coerceValue(probe, rawValue);
  if (!result.ok) {
    throw new AppError(result.error, 422, "validation");
  }

  const slot = result.value;
  const isEmptY =
    slot.valueText === null &&
    slot.valueNumber === null &&
    slot.valueDate === null &&
    slot.valueBoolean === null &&
    (slot.valueJson === null || slot.valueJson.length === 0);

  await db.transaction(async (tx) => {
    if (isEmptY) {
      await tx
        .delete(recordValues)
        .where(
          and(
            inArray(recordValues.recordId, recordIds),
            eq(recordValues.fieldId, field.id),
          ),
        );
    } else {
      await tx
        .delete(recordValues)
        .where(
          and(
            inArray(recordValues.recordId, recordIds),
            eq(recordValues.fieldId, field.id),
          ),
        );
      await tx.insert(recordValues).values(
        recordIds.map((recordId) => ({
          id: crypto.randomUUID(),
          recordId,
          fieldId: field.id,
          valueText: slot.valueText,
          valueNumber: slot.valueNumber,
          valueDate: slot.valueDate,
          valueBoolean: slot.valueBoolean,
          valueJson: slot.valueJson as never,
        })),
      );
    }

    await tx
      .update(records)
      .set({
        dataVersion: sql`${records.dataVersion} + 1`,
        updatedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(inArray(records.id, recordIds));
  });

  // Rebuild search text for the affected records (bounded batches).
  const rebuildInBatches = async () => {
    for (let index = 0; index < recordIds.length; index += 100) {
      const batch = recordIds.slice(index, index + 100);
      await rebuildSearchTextForRecords(batch, session);
    }
  };
  await rebuildInBatches();

  await recordAudit({
    action: AUDIT_ACTIONS.RECORDS_BULK_UPDATED,
    entityType: "record",
    entityId: recordIds.slice(0, 5).join(",").slice(0, 64),
    registerId: null,
    summary: `Set "${field.name}" on ${recordIds.length} record${recordIds.length === 1 ? "" : "s"}`,
    metadata: { field: field.name, recordIds: recordIds.slice(0, 50) },
    actorUserId: session.user.id,
    actorEmail: session.user.email,
  });

  return { updated: recordIds.length };
}

export async function rebuildSearchTextForRecords(
  recordIds: string[],
  session: Session,
): Promise<void> {
  if (recordIds.length === 0) return;

  const sample = await db
    .select({ registerId: records.registerId })
    .from(records)
    .where(inArray(records.id, recordIds))
    .limit(1);
  const registerId = sample[0]?.registerId;
  if (!registerId) return;

  const fields = await db
    .select()
    .from(registerFields)
    .where(eq(registerFields.registerId, registerId));
  const fieldById = new Map(fields.map((field) => [field.id, field]));

  const valueRows = await db
    .select()
    .from(recordValues)
    .where(inArray(recordValues.recordId, recordIds));

  const byRecord = new Map<string, Record<string, ValueSlot>>();
  for (const row of valueRows) {
    const field = fieldById.get(row.fieldId);
    if (!field) continue;
    let bucket = byRecord.get(row.recordId);
    if (!bucket) {
      bucket = {};
      byRecord.set(row.recordId, bucket);
    }
    bucket[field.id] = slotFromRow(field.fieldType, row);
  }

  for (const recordId of recordIds) {
    const values = byRecord.get(recordId) ?? {};
    await db
      .update(records)
      .set({ searchText: buildSearchText(fields, values) })
      .where(eq(records.id, recordId));
  }
  void session;
}

/* ---------------------------------- misc --------------------------------- */

export function summarizeValues(
  fields: RegisterField[],
  values: Record<string, ValueSlot>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields.slice(0, 20)) {
    const slot = values[field.id];
    if (!slot) continue;
    const text = formatSlotForDisplay(field, slot);
    if (text) out[field.name] = text.slice(0, 200);
  }
  return out;
}

export async function countRecordsForRegister(
  registerId: string,
  options: { includeArchived?: boolean; search?: string } = {},
): Promise<number> {
  const clauses: SQL[] = [eq(records.registerId, registerId)];
  if (!options.includeArchived) {
    clauses.push(eq(records.status, "active"));
    clauses.push(isNull(records.deletedAt));
  }
  if (options.search) {
    clauses.push(sql`records.search_text LIKE ${`%${escapeLike(options.search)}%`}`);
  }
  return rawCount(
    sql`SELECT COUNT(*) AS count FROM records WHERE ${sql.join(clauses, sql` AND `)}`,
  );
}

export { escapeLike };

/* --------------------------- listing extensions --------------------------- */

export type RecordStatusFilter = "active" | "archived" | "all";

async function loadRecordListItems(
  ids: string[],
  fields: RegisterField[],
): Promise<RecordListItem[]> {
  if (ids.length === 0) return [];

  const metaRows = await db.select().from(records).where(inArray(records.id, ids));
  const metaById = new Map(metaRows.map((row) => [row.id, row]));

  const valueRows = await db
    .select()
    .from(recordValues)
    .where(inArray(recordValues.recordId, ids));

  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const valuesByRecord = new Map<string, Map<string, ValueSlot>>();
  for (const value of valueRows) {
    const field = fieldById.get(value.fieldId);
    if (!field) continue;
    let bucket = valuesByRecord.get(value.recordId);
    if (!bucket) {
      bucket = new Map();
      valuesByRecord.set(value.recordId, bucket);
    }
    bucket.set(field.id, slotFromRow(field.fieldType, value));
  }

  const ordered: RecordListItem[] = [];
  for (const id of ids) {
    const meta = metaById.get(id);
    if (!meta) continue;
    ordered.push({
      id: meta.id,
      serial: Number(meta.serial),
      status: meta.status,
      dataVersion: meta.dataVersion,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      values: Object.fromEntries(valuesByRecord.get(id) ?? []),
    });
  }
  return ordered;
}

/**
 * Lists records honouring an explicit status filter. "active" and "all" defer
 * to `listRecords`; "archived" needs its own where clause because the base
 * listing only distinguishes active vs. everything.
 */
export async function listRecordsWithStatus(
  query: RecordQuery,
  fields: RegisterField[],
  status: RecordStatusFilter = "active",
): Promise<RecordPage> {
  if (status === "active") return listRecords(query, fields);
  if (status === "all") return listRecords({ ...query, includeArchived: true }, fields);

  const pageSize = PAGE_SIZES.includes((query.pageSize ?? 50) as (typeof PAGE_SIZES)[number])
    ? (query.pageSize ?? 50)
    : 50;
  const page = Math.max(1, Math.floor(query.page ?? 1));

  const clauses: SQL[] = [
    eq(records.registerId, query.registerId),
    eq(records.status, "archived"),
  ];

  const search = query.search?.trim();
  if (search) {
    clauses.push(sql`records.search_text LIKE ${`%${escapeLike(search)}%`}`);
  }

  const byField = new Map(fields.map((field) => [field.id, field]));
  for (const filter of query.filters ?? []) {
    const field = byField.get(filter.fieldId);
    if (!field) continue;
    const sqlClause = buildFilterSql(filter, field);
    if (sqlClause) clauses.push(sqlClause);
  }

  const total = await rawCount(
    sql`SELECT COUNT(*) AS count FROM records WHERE ${sql.join(clauses, sql` AND `)}`,
  );

  const orderSql = query.sort
    ? buildOrderBy(query, fields)
    : sql`ORDER BY records.updated_at DESC, records.serial DESC`;

  const offset = (page - 1) * pageSize;
  const pageRows = await rawRows<{ id: string }>(
    sql`SELECT records.id AS id FROM records WHERE ${sql.join(clauses, sql` AND `)} ${orderSql} LIMIT ${pageSize} OFFSET ${offset}`,
  );

  const items = await loadRecordListItems(
    pageRows.map((row) => row.id),
    fields,
  );

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Loads records by id, optionally constrained to one register, preserving input order. */
export async function listRecordsByIds(
  recordIds: string[],
  fields: RegisterField[],
  registerId?: string,
): Promise<RecordListItem[]> {
  const unique = [...new Set(recordIds)];
  if (unique.length === 0) return [];

  let ids = unique;
  if (registerId) {
    const rows = await db
      .select({ id: records.id })
      .from(records)
      .where(and(inArray(records.id, unique), eq(records.registerId, registerId)));
    const allowed = new Set(rows.map((row) => row.id));
    ids = unique.filter((id) => allowed.has(id));
  }

  const items = await loadRecordListItems(ids, fields);
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids
    .map((id) => byId.get(id))
    .filter((item): item is RecordListItem => item !== undefined);
}

/**
 * Pages through a query until every matching record is collected (bounded by
 * `cap`) so exports are not limited to a single page of results.
 */
export async function listRecordsForExport(
  query: RecordQuery,
  fields: RegisterField[],
  status: RecordStatusFilter = "active",
  cap = 20000,
): Promise<RecordListItem[]> {
  const pageSize = 200;
  const collected: RecordListItem[] = [];
  let page = 1;

  for (;;) {
    const result = await listRecordsWithStatus(
      { ...query, page, pageSize },
      fields,
      status,
    );
    collected.push(...result.items);
    if (result.items.length === 0) break;
    if (page >= result.pageCount) break;
    if (collected.length >= cap) break;
    page += 1;
  }

  return collected.slice(0, cap);
}

/** Intersects candidate record ids with those that belong to the register. */
export async function filterRecordIdsForRegister(
  recordIds: string[],
  registerId: string,
): Promise<string[]> {
  const unique = [...new Set(recordIds)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: records.id })
    .from(records)
    .where(and(inArray(records.id, unique), eq(records.registerId, registerId)));
  const allowed = new Set(rows.map((row) => row.id));
  return unique.filter((id) => allowed.has(id));
}
