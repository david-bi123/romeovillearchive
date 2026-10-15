import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { affectedCount, db, rawRows } from "@/lib/db";
import {
  importErrors,
  importJobs,
  recordValues,
  records,
  registerFields,
  registers,
  type FieldType,
  type ImportJob,
  type RegisterField,
} from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { coerceValue, slotToPlainString, validateRecordValues, type ValueSlot } from "@/lib/field-values";
import { fieldKeyFrom, isReservedFieldKey } from "@/lib/utils";
import { XLSX, extractRows, listSheets, readWorkbook } from "@/lib/excel/workbook";
import { proposeMapping, profileColumn, type ColumnProfile, type MappingEntry } from "@/lib/excel/infer";

/* --------------------------------- types --------------------------------- */

export type ImportAction = "map" | "create" | "ignore";

export type ImportColumnPlan = {
  excelIndex: number;
  header: string;
  action: ImportAction;
  fieldId?: string | null;
  create?: {
    name: string;
    fieldType: FieldType;
    required: boolean;
    options: string[];
    helpText: string | null;
    showInTable: boolean;
    showInCard: boolean;
    editable: boolean;
  } | null;
};

export type ImportMapping = {
  sheetName: string;
  headerRow: number;
  columns: ImportColumnPlan[];
};

export type ImportStrategy = {
  mode: "append" | "append_skip_duplicates" | "update_existing";
  /** Field used to detect duplicates / match rows to existing records. */
  matchFieldId?: string | null;
  /** Create missing register fields from spreadsheet columns. */
  createNewFields?: boolean;
};

export type RowValidation = {
  rowNumber: number;
  index: number;
  values: Record<string, unknown>;
  errors: { fieldId: string; fieldKey: string; fieldName: string; message: string }[];
  empty: boolean;
  duplicateOfSerial: number | null;
};

export type ValidationSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  emptyRows: number;
  duplicateRows: number;
  warnings: { rowNumber: number; message: string }[];
  rows: RowValidation[];
  /** True when the full data set was scanned (not just the preview sample). */
  complete: boolean;
};

const BATCH_SIZE = 100;
const MAX_STORED_ERRORS = 2000;
const PREVIEW_ROWS = 25;

/* ------------------------------- workbook I/O ----------------------------- */

export async function assembleWorkbookBuffer(jobId: string): Promise<Buffer> {
  const chunks = await rawRows<{ chunk_index: number; data: Buffer }>(
    sql`SELECT chunk_index, data FROM import_chunks WHERE job_id = ${jobId} ORDER BY chunk_index ASC`,
  );
  if (chunks.length === 0) throw new Error("The uploaded file could not be found.");
  const buffers = chunks
    .sort((a, b) => a.chunk_index - b.chunk_index)
    .map((chunk) => (Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(chunk.data)));
  return Buffer.concat(buffers);
}

export async function deleteWorkbookChunks(jobId: string): Promise<void> {
  await rawRows(sql`DELETE FROM import_chunks WHERE job_id = ${jobId}`);
}

/* -------------------------------- analysis -------------------------------- */

export async function analyseWorkbook(
  buffer: Buffer,
  options: { sheetName?: string; headerRow?: number; maxRows: number },
): Promise<{
  sheets: ReturnType<typeof listSheets>;
  profile: {
    sheetName: string;
    headerRow: number;
    headers: string[];
    profiles: ColumnProfile[];
    preview: unknown[][];
    previewRowNumbers: number[];
    totalRows: number;
    warnings: string[];
    truncated: boolean;
  } | null;
}> {
  const workbook = readWorkbook(buffer);
  const sheets = listSheets(workbook);

  const sheetName = options.sheetName && sheets.some((sheet) => sheet.name === options.sheetName)
    ? options.sheetName
    : sheets.find((sheet) => !sheet.empty)?.name ?? sheets[0]?.name;

  if (!sheetName) {
    return { sheets, profile: null };
  }

  const headerRow = Math.max(1, options.headerRow ?? detectHeaderRow(workbook, sheetName));
  const extracted = extractRows(workbook, sheetName, headerRow, { maxRows: options.maxRows });

  const columnCount = extracted.headers.length;
  const profiles: ColumnProfile[] = [];
  for (let index = 0; index < columnCount; index++) {
    const values = extracted.rows.map((row) => row[index] ?? null);
    profiles.push(profileColumn(extracted.headers[index], values));
  }

  return {
    sheets,
    profile: {
      sheetName,
      headerRow: extracted.headerRow,
      headers: extracted.headers,
      profiles,
      preview: extracted.rows.slice(0, PREVIEW_ROWS),
      previewRowNumbers: extracted.rowNumbers.slice(0, PREVIEW_ROWS),
      totalRows: extracted.rows.length,
      warnings: extracted.warnings,
      truncated: extracted.truncated,
    },
  };
}

/**
 * Guesses which row holds the header: the first row where most cells are
 * non-numeric text. A conservative heuristic the user can override.
 */
export function detectHeaderRow(
  workbook: ReturnType<typeof readWorkbook>,
  sheetName: string,
): number {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet || !worksheet["!ref"]) return 1;

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
    range: worksheet["!ref"],
  }) as unknown[][];

  const scanLimit = Math.min(matrix.length, 10);
  for (let index = 0; index < scanLimit; index++) {
    const row = (matrix[index] ?? []).filter(
      (cell) => cell !== null && cell !== undefined && String(cell).trim() !== "",
    );
    if (row.length === 0) continue;
    const textCells = row.filter((cell) => Number.isNaN(Number(cell))).length;
    if (textCells / row.length >= 0.6) return range.s.r + index + 1;
  }
  return range.s.r + 1;
}

export function proposeTargetMapping(
  headers: string[],
  fields: RegisterField[],
): MappingEntry[] {
  return proposeMapping(
    headers,
    fields.map((field) => ({
      id: field.id,
      fieldKey: field.fieldKey,
      name: field.name,
      fieldType: field.fieldType,
    })),
    headers.map((header) => profileColumn(header, [])),
  ).map((entry, index) => ({ ...entry, excelIndex: index }));
}

/* ------------------------------- validation ------------------------------- */

export async function validateRows(
  job: ImportJob,
  mapping: ImportMapping,
  strategy: ImportStrategy,
  options: { maxRows: number; all?: boolean },
): Promise<ValidationSummary> {
  const buffer = await assembleWorkbookBuffer(job.id);
  const workbook = readWorkbook(buffer);
  const extracted = extractRows(workbook, mapping.sheetName, mapping.headerRow, {
    maxRows: options.maxRows,
  });

  const { effectiveFields, fieldByExcelIndex } = await resolveTargetFields(job, mapping);

  const warnings: ValidationSummary["warnings"] = [];
  const rows: RowValidation[] = [];
  let emptyRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;

  const duplicateKeys =
    strategy.matchFieldId && job.targetRegisterId
      ? await loadExistingKeys(job.targetRegisterId, strategy.matchFieldId)
      : null;

  const limit = options.all ? extracted.rows.length : Math.min(PREVIEW_ROWS, extracted.rows.length);

  for (let index = 0; index < extracted.rows.length; index++) {
    const row = extracted.rows[index];
    const rowNumber = extracted.rowNumbers[index];
    const isEmpty = row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");

    if (isEmpty) {
      emptyRows += 1;
      if (rows.length < limit) {
        rows.push({ rowNumber, index, values: {}, errors: [], empty: true, duplicateOfSerial: null });
      }
      continue;
    }

    const values: Record<string, unknown> = {};
    for (const [excelIndex, field] of fieldByExcelIndex.entries()) {
      values[field.id] = row[excelIndex] ?? null;
    }

    const { errors } = validateRecordValues(effectiveFields, values);
    const mappedErrors = errors.map((error) => {
      const field = effectiveFields.find((candidate) => candidate.id === error.fieldId);
      return {
        fieldId: error.fieldId,
        fieldKey: field?.fieldKey ?? "",
        fieldName: field?.name ?? "",
        message: error.message,
      };
    });

    if (mappedErrors.length > 0) invalidRows += 1;

    let duplicateOfSerial: number | null = null;
    if (duplicateKeys && strategy.matchFieldId) {
      const matchField = effectiveFields.find((field) => field.id === strategy.matchFieldId);
      const slot = buildSlotForField(matchField ?? null, values[matchField?.id ?? ""]);
      if (matchField && slot) {
        const key = slotToPlainString(matchField, slot);
        if (key) {
          const serial = duplicateKeys.get(key);
          if (serial !== undefined) duplicateOfSerial = serial;
        }
      }
    }
    if (duplicateOfSerial !== null) duplicateRows += 1;

    if (rows.length < limit) {
      rows.push({ rowNumber, index, values, errors: mappedErrors, empty: false, duplicateOfSerial });
    }
  }

  void effectiveFields;
  return {
    totalRows: extracted.rows.length,
    validRows: extracted.rows.length - emptyRows - invalidRows,
    invalidRows,
    emptyRows,
    duplicateRows,
    warnings,
    rows,
    complete: true,
  };
}

function buildSlotForField(field: RegisterField | null, raw: unknown): ValueSlot | null {
  if (!field || raw === null || raw === undefined || raw === "") return null;
  const result = coerceValue(field, raw);
  return result.ok ? result.value : null;
}

async function loadExistingKeys(registerId: string, fieldId: string): Promise<Map<string, number>> {
  const rows = await rawRows<{
    serial: number;
    value_text: string | null;
    value_number: number | null;
    value_date: Date | null;
    value_boolean: boolean | null;
    value_json: string | null;
  }>(
    sql`SELECT r.serial, v.value_text, v.value_number, v.value_date, v.value_boolean, v.value_json
        FROM record_values v
        INNER JOIN records r ON r.id = v.record_id
        WHERE v.field_id = ${fieldId} AND r.register_id = ${registerId} AND r.status = 'active'`,
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = plainKeyFromRow(fieldId, row);
    if (key) map.set(key, Number(row.serial));
  }
  return map;
}

function plainKeyFromRow(
  fieldId: string,
  row: {
    value_text: string | null;
    value_number: number | null;
    value_date: Date | null;
    value_boolean: boolean | null;
    value_json: string | null;
  },
): string {
  void fieldId;
  if (row.value_text !== null && row.value_text !== "") return row.value_text.trim().toLowerCase();
  if (row.value_number !== null) return String(row.value_number);
  if (row.value_date !== null) return new Date(row.value_date).toISOString().slice(0, 10);
  if (row.value_boolean !== null) return row.value_boolean ? "true" : "false";
  if (row.value_json) {
    try {
      const parsed = JSON.parse(row.value_json) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).join(",").toLowerCase();
    } catch {
      return "";
    }
  }
  return "";
}

/* --------------------------- effective field set -------------------------- */

export type EffectiveFieldSet = {
  effectiveFields: RegisterField[];
  fieldByExcelIndex: Map<number, RegisterField>;
  createdFields: string[];
};

/** Case-insensitive lookup key so equivalent spellings resolve to one field. */
function fieldLookupKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Creates any new fields requested by the mapping (once) and returns the final
 * field list plus the excel-column -> field lookup used for validation.
 *
 * Idempotent: a `create` column whose name already matches an existing field
 * (including one created by an earlier run of this function, since preview and
 * execution both call it) reuses that field instead of inserting a duplicate.
 */
export async function resolveTargetFields(
  job: ImportJob,
  mapping: ImportMapping,
): Promise<EffectiveFieldSet> {
  const registerId = job.targetRegisterId;
  if (!registerId) throw new Error("The import has no target register.");

  const existing = await db
    .select()
    .from(registerFields)
    .where(eq(registerFields.registerId, registerId))
    .orderBy(asc(registerFields.displayOrder), asc(registerFields.id));

  const byId = new Map(existing.map((field) => [field.id, field]));
  const byName = new Map(existing.map((field) => [fieldLookupKey(field.name), field]));
  const taken = new Set(existing.map((field) => field.fieldKey));
  const createdFields: string[] = [];
  const resolvedByColumn = new Map<number, RegisterField>();

  if (mapping.columns.some((column) => column.action === "create")) {
    let order = existing.length;
    for (const column of mapping.columns) {
      if (column.action !== "create" || !column.create) continue;

      const lookupKey = fieldLookupKey(column.create.name);
      const reused = byName.get(lookupKey);
      if (reused) {
        resolvedByColumn.set(column.excelIndex, reused);
        continue;
      }

      const key = fieldKeyFrom(column.create.name, taken);
      if (isReservedFieldKey(key)) continue;
      taken.add(key);

      const id = crypto.randomUUID();
      await db.insert(registerFields).values({
        id,
        registerId,
        fieldKey: key,
        name: column.create.name.slice(0, 160),
        fieldType: column.create.fieldType,
        required: column.create.required,
        helpText: column.create.helpText,
        options: (column.create.options.length ? column.create.options : null) as never,
        displayOrder: ++order,
        showInTable: column.create.showInTable,
        showInCard: column.create.showInCard,
        editable: column.create.editable,
      });
      const field: RegisterField = {
        id,
        registerId,
        fieldKey: key,
        name: column.create.name.slice(0, 160),
        fieldType: column.create.fieldType,
        required: column.create.required,
        helpText: column.create.helpText,
        options: (column.create.options.length ? column.create.options : null) as never,
        defaultValue: null,
        displayOrder: order,
        showInTable: column.create.showInTable,
        showInCard: column.create.showInCard,
        editable: column.create.editable,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      byId.set(id, field);
      byName.set(lookupKey, field);
      createdFields.push(id);
      resolvedByColumn.set(column.excelIndex, field);
    }

    if (createdFields.length > 0) {
      await recordAudit({
        action: AUDIT_ACTIONS.FIELD_ADDED,
        entityType: "register",
        entityId: registerId,
        registerId,
        summary: `Created ${createdFields.length} column(s) during import`,
        metadata: { fieldIds: createdFields },
        actorUserId: job.createdByUserId,
      });
    }
  }

  const effectiveFields = Array.from(byId.values());
  const fieldByExcelIndex = new Map<number, RegisterField>();
  for (const column of mapping.columns) {
    if (column.action === "map" && column.fieldId) {
      const field = byId.get(column.fieldId);
      if (field) fieldByExcelIndex.set(column.excelIndex, field);
    } else if (column.action === "create") {
      const resolved = resolvedByColumn.get(column.excelIndex);
      if (resolved) fieldByExcelIndex.set(column.excelIndex, resolved);
    }
  }

  return { effectiveFields, fieldByExcelIndex, createdFields };
}

/* -------------------------------- execution ------------------------------- */

export type ProcessResult = {
  status: "completed" | "partial" | "failed" | "cancelled";
  rowsTotal: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsRejected: number;
  duplicatesFound: number;
  message: string;
};

/**
 * Executes an import job.
 *
 * Design notes for serverless execution:
 *  - rows are committed in batches of 100 inside transactions, and the job's
 *    progress counter is updated inside the same transaction, so a retry after
 *    a mid-flight failure resumes exactly where it stopped instead of
 *    duplicating rows;
 *  - a status transition guarded by WHERE status = ... ensures only one
 *    execution owns the job at a time;
 *  - cancellation is honoured between batches.
 */
export async function processImportJob(jobId: string): Promise<ProcessResult> {
  const jobRows = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) throw new Error("Import job not found");

  const claimed = await db
    .update(importJobs)
    .set({ status: "processing", startedAt: job.startedAt ?? new Date(), updatedAt: new Date() })
    .where(and(eq(importJobs.id, jobId), inArray(importJobs.status, ["draft", "pending", "processing"])));

  if (affectedCount(claimed) === 0) {
    const current = (await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1))[0];
    return {
      status: "cancelled",
      rowsTotal: current?.rowsTotal ?? 0,
      rowsImported: current?.rowsImported ?? 0,
      rowsUpdated: current?.rowsUpdated ?? 0,
      rowsSkipped: current?.rowsSkipped ?? 0,
      rowsRejected: current?.rowsRejected ?? 0,
      duplicatesFound: current?.duplicatesFound ?? 0,
      message: "The job is already owned by another worker.",
    };
  }

  try {
    return await execute(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[import] job failed", { jobId, message });
    await db
      .update(importJobs)
      .set({ status: "failed", errorMessage: message.slice(0, 2000), finishedAt: new Date() })
      .where(eq(importJobs.id, jobId));
    await recordAudit({
      action: AUDIT_ACTIONS.IMPORT_FAILED,
      entityType: "import",
      entityId: jobId,
      summary: `Import failed: ${message.slice(0, 200)}`,
      actorUserId: job.createdByUserId,
    });
    return {
      status: "failed",
      rowsTotal: job.rowsTotal,
      rowsImported: job.rowsImported,
      rowsUpdated: job.rowsUpdated,
      rowsSkipped: job.rowsSkipped,
      rowsRejected: job.rowsRejected,
      duplicatesFound: job.duplicatesFound,
      message,
    };
  }
}

async function execute(job: ImportJob): Promise<ProcessResult> {
  const mapping = job.mapping as ImportMapping | null;
  const strategy = (job.strategy as ImportStrategy | null) ?? {
    mode: "append",
    createNewFields: true,
  };

  if (!mapping || !job.targetRegisterId) {
    throw new Error("The import configuration is incomplete (missing mapping or register).");
  }

  const { getUploadLimits } = await import("@/lib/env");
  const { maxImportRows } = getUploadLimits();

  const buffer = await assembleWorkbookBuffer(job.id);
  const workbook = readWorkbook(buffer);
  const extracted = extractRows(workbook, mapping.sheetName, mapping.headerRow, {
    maxRows: maxImportRows,
  });

  const { effectiveFields, fieldByExcelIndex } = await resolveTargetFields(job, mapping);
  const fieldsById = new Map(effectiveFields.map((field) => [field.id, field]));

  const existingKeys =
    strategy.mode !== "append" && strategy.matchFieldId
      ? await loadExistingKeys(job.targetRegisterId, strategy.matchFieldId)
      : null;

  const matchField = strategy.matchFieldId ? fieldsById.get(strategy.matchFieldId) ?? null : null;

  // Determine resume point: rows already committed are skipped.
  const startIndex = Math.max(0, Math.min(job.progress, extracted.rows.length));

  let imported = job.rowsImported;
  let updated = job.rowsUpdated;
  let skipped = job.rowsSkipped;
  let rejected = job.rowsRejected;
  let duplicates = job.duplicatesFound;
  let processed = startIndex;
  let cancelled = false;
  const storedErrors: {
    id: string;
    jobId: string;
    rowNumber: number;
    columnName: string | null;
    code: string;
    message: string;
    severity: "error" | "warning";
  }[] = [];

  const cancelCheck = async (): Promise<boolean> => {
    const rows = await rawRows<{ cancel_requested: number }>(
      sql`SELECT cancel_requested AS cancel_requested FROM import_jobs WHERE id = ${job.id}`,
    );
    return Number(rows[0]?.cancel_requested ?? 0) === 1;
  };

  for (let index = startIndex; index < extracted.rows.length; index++) {
    if (processed > 0 && processed % BATCH_SIZE === 0 && (await cancelCheck())) {
      cancelled = true;
      break;
    }

    const batchEnd = Math.min(index + BATCH_SIZE, extracted.rows.length);

    // ---- validate the whole batch first ----
    type PreparedRow =
      | { kind: "empty" | "skip"; index: number; rowNumber: number }
      | {
          kind: "insert";
          index: number;
          rowNumber: number;
          recordId: string;
          values: Record<string, unknown>;
        }
      | {
          kind: "update";
          index: number;
          rowNumber: number;
          recordId: string;
          serial: number;
          values: Record<string, unknown>;
        }
      | { kind: "error"; index: number; rowNumber: number; errors: RowValidation["errors"] };

    const prepared: PreparedRow[] = [];

    for (let i = index; i < batchEnd; i++) {
      const currentRow = extracted.rows[i];
      const currentRowNumber = extracted.rowNumbers[i];
      const blank = currentRow.every(
        (cell) => cell === null || cell === undefined || String(cell).trim() === "",
      );

      if (blank) {
        skipped += 1;
        prepared.push({ kind: "empty", index: i, rowNumber: currentRowNumber });
        continue;
      }

      const values: Record<string, unknown> = {};
      for (const [excelIndex, field] of fieldByExcelIndex.entries()) {
        values[field.id] = currentRow[excelIndex] ?? null;
      }

      const { errors } = validateRecordValues(effectiveFields, values);
      if (errors.length > 0) {
        rejected += 1;
        prepared.push({
          kind: "error",
          index: i,
          rowNumber: currentRowNumber,
          errors: errors.map((error) => ({
            fieldId: error.fieldId,
            fieldKey: fieldsById.get(error.fieldId)?.fieldKey ?? "",
            fieldName: fieldsById.get(error.fieldId)?.name ?? "",
            message: error.message,
          })),
        });
        continue;
      }

      // duplicate handling
      if (existingKeys && matchField) {
        const slot = buildSlotForField(matchField, values[matchField.id]);
        const key = slot ? slotToPlainString(matchField, slot).trim().toLowerCase() : "";
        const existingSerial = key ? existingKeys.get(key) : undefined;

        if (existingSerial !== undefined) {
          duplicates += 1;
          if (strategy.mode === "append_skip_duplicates") {
            skipped += 1;
            prepared.push({ kind: "skip", index: i, rowNumber: currentRowNumber });
            continue;
          }
          if (strategy.mode === "update_existing") {
            const recordId = (
              await rawRows<{ id: string }>(
                sql`SELECT r.id FROM records r
                    INNER JOIN record_values v ON v.record_id = r.id
                    WHERE r.register_id = ${job.targetRegisterId}
                      AND v.field_id = ${matchField.id}
                      AND LOWER(COALESCE(v.value_text, CAST(v.value_number AS CHAR))) = ${key}
                    LIMIT 1`,
              )
            )[0]?.id;
            if (recordId) {
              prepared.push({
                kind: "update",
                index: i,
                rowNumber: currentRowNumber,
                recordId,
                serial: existingSerial,
                values,
              });
              continue;
            }
          }
        }
      }

      prepared.push({
        kind: "insert",
        index: i,
        rowNumber: currentRowNumber,
        recordId: crypto.randomUUID(),
        values,
      });
    }

    // ---- commit the batch ----
    const updateTargets: { recordId: string; values: Record<string, unknown> }[] = [];

    for (const item of prepared) {
      if (item.kind === "insert") {
        imported += 1;
      } else if (item.kind === "update") {
        updateTargets.push({ recordId: item.recordId, values: item.values });
        updated += 1;
      } else if (item.kind === "error" && storedErrors.length < MAX_STORED_ERRORS) {
        for (const error of item.errors) {
          storedErrors.push({
            id: crypto.randomUUID(),
            jobId: job.id,
            rowNumber: item.rowNumber,
            columnName: error.fieldName || error.fieldKey || null,
            code: "validation_failed",
            message: error.message.slice(0, 600),
            severity: "error",
          });
        }
      }
      processed += 1;
    }

    await db.transaction(async (tx) => {
      // Serial allocation for inserts (one UPDATE + locking read per row).
      for (const item of prepared) {
        if (item.kind !== "insert") continue;
        await tx
          .update(registers)
          .set({ serialCounter: sql`${registers.serialCounter} + 1` })
          .where(eq(registers.id, job.targetRegisterId!));
        const serialRows = await tx
          .select({ serial: registers.serialCounter })
          .from(registers)
          .where(eq(registers.id, job.targetRegisterId!))
          .for("update")
          .limit(1);
        const serial = Number(serialRows[0]?.serial ?? 0);
        await tx.insert(records).values({
          id: item.recordId,
          registerId: job.targetRegisterId!,
          serial,
          createdByUserId: job.createdByUserId,
          updatedByUserId: job.createdByUserId,
          searchText: buildSearchText(effectiveFields, item.values),
        });
      }

      const rowsToInsert = prepared.flatMap((item) =>
        item.kind === "insert" ? buildValueRows(item.recordId, effectiveFields, item.values) : [],
      );
      if (rowsToInsert.length > 0) await tx.insert(recordValues).values(rowsToInsert);

      for (const target of updateTargets) {
        await tx.delete(recordValues).where(eq(recordValues.recordId, target.recordId));
        const rows = buildValueRows(target.recordId, effectiveFields, target.values);
        if (rows.length > 0) await tx.insert(recordValues).values(rows);
        await tx
          .update(records)
          .set({
            dataVersion: sql`${records.dataVersion} + 1`,
            updatedByUserId: job.createdByUserId,
            searchText: buildSearchText(effectiveFields, target.values),
            updatedAt: new Date(),
          })
          .where(eq(records.id, target.recordId));
      }

      const insertedCount = prepared.filter((item) => item.kind === "insert").length;
      if (insertedCount > 0) {
        await tx
          .update(registers)
          .set({ recordCount: sql`${registers.recordCount} + ${insertedCount}` })
          .where(eq(registers.id, job.targetRegisterId!));
      }

      // Progress and counters commit with the data so a resume cannot re-apply
      // rows that were already written.
      await tx
        .update(importJobs)
        .set({
          progress: processed,
          rowsTotal: extracted.rows.length,
          rowsImported: imported,
          rowsUpdated: updated,
          rowsSkipped: skipped,
          rowsRejected: rejected,
          duplicatesFound: duplicates,
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, job.id));
    });

    index = batchEnd - 1;
  }

  if (storedErrors.length > 0) {
    // Errors are rewritten wholesale so a re-run never duplicates them.
    await rawRows(sql`DELETE FROM import_errors WHERE job_id = ${job.id}`);
    await db.insert(importErrors).values(storedErrors);
  }

  const status: ProcessResult["status"] = cancelled
    ? "cancelled"
    : rejected > 0
      ? "partial"
      : "completed";

  await db
    .update(importJobs)
    .set({
      status,
      finishedAt: new Date(),
      errorMessage: cancelled ? "Import cancelled by a user." : null,
    })
    .where(eq(importJobs.id, job.id));

  await deleteWorkbookChunks(job.id);

  await recordAudit({
    action: cancelled ? AUDIT_ACTIONS.IMPORT_CANCELLED : AUDIT_ACTIONS.IMPORT_COMPLETED,
    entityType: "import",
    entityId: job.id,
    registerId: job.targetRegisterId,
    summary: cancelled
      ? "Import cancelled"
      : `Import finished: ${imported} added, ${updated} updated, ${rejected} rejected`,
    metadata: { imported, updated, skipped, rejected, duplicates, total: extracted.rows.length },
    actorUserId: job.createdByUserId,
  });

  const message = cancelled
    ? "The import was cancelled. Rows committed before cancellation are kept."
    : rejected > 0
      ? `Import finished with ${rejected} rejected row${rejected === 1 ? "" : "s"}. Download the error report for details.`
      : `Import finished successfully — ${imported} record${imported === 1 ? "" : "s"} added${updated ? `, ${updated} updated` : ""}.`;

  return {
    status,
    rowsTotal: extracted.rows.length,
    rowsImported: imported,
    rowsUpdated: updated,
    rowsSkipped: skipped,
    rowsRejected: rejected,
    duplicatesFound: duplicates,
    message,
  };
}

function buildValueRows(
  recordId: string,
  fields: RegisterField[],
  values: Record<string, unknown>,
): (typeof recordValues.$inferInsert)[] {
  const rows: (typeof recordValues.$inferInsert)[] = [];
  for (const field of fields) {
    const raw = values[field.id];
    if (raw === null || raw === undefined || raw === "") continue;
    const result = coerceValue({ ...field, required: false }, raw);
    if (!result.ok) continue;
    const slot = result.value;
    if (
      slot.valueText === null &&
      slot.valueNumber === null &&
      slot.valueDate === null &&
      slot.valueBoolean === null &&
      (slot.valueJson === null || slot.valueJson.length === 0)
    ) {
      continue;
    }
    rows.push({
      id: crypto.randomUUID(),
      recordId,
      fieldId: field.id,
      valueText: slot.valueText,
      valueNumber: slot.valueNumber,
      valueDate: slot.valueDate,
      valueBoolean: slot.valueBoolean,
      valueJson: slot.valueJson as never,
    });
  }
  return rows;
}

function buildSearchText(fields: RegisterField[], values: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const field of fields) {
    const raw = values[field.id];
    if (raw === null || raw === undefined || raw === "") continue;
    const result = coerceValue({ ...field, required: false }, raw);
    if (result.ok) {
      const text = slotToPlainString(field, result.value);
      if (text) parts.push(text);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

/* ------------------------------ retry / resume ---------------------------- */

/**
 * Finds jobs that are stuck in `pending`/`processing` (for example because the
 * serverless function was interrupted) and resumes them. Safe to call from a
 * scheduled endpoint: ownership is claimed with a guarded status update.
 */
export async function resumeStalledImports(limit = 3): Promise<string[]> {
  const stalled = await db
    .select()
    .from(importJobs)
    .where(inArray(importJobs.status, ["pending", "processing"]))
    .orderBy(asc(importJobs.createdAt))
    .limit(limit);

  const resumed: string[] = [];
  for (const job of stalled) {
    const ageMs = Date.now() - job.updatedAt.getTime();
    if (job.status === "processing" && ageMs < 60_000) continue; // still running
    resumed.push(job.id);
    await processImportJob(job.id).catch((error) => {
      console.error("[import] resume failed", job.id, error instanceof Error ? error.message : error);
    });
  }
  return resumed;
}

export { PREVIEW_ROWS, BATCH_SIZE, profileColumn };
