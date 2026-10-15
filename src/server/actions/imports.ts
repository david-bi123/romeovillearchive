"use server";

import { after } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { affectedCount, db, rawCount } from "@/lib/db";
import { FIELD_TYPES, importErrors, importJobs, type ImportJob } from "@/lib/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import {
  AppError,
  assertPermission,
  getRegisterAccess,
  notFound,
  requireCapability,
  requireSessionOrThrow,
} from "@/lib/auth/guard";
import type { Session } from "@/lib/auth/session";
import { getUploadLimits } from "@/lib/env";
import {
  deleteWorkbookChunks,
  processImportJob,
  validateRows,
  type ImportMapping,
  type ImportStrategy,
} from "@/lib/import/engine";
import { createRegister, registerInputSchema } from "@/server/registers";
import {
  assertImportJobWritable,
  importJobSummary,
  loadImportJobForSession,
  type ImportErrorItem,
  type ImportJobSummary,
  type SaveImportConfigData,
  type SaveImportConfigInput,
  type StartImportData,
} from "@/server/imports";
import { requestMeta, toActionState, type ActionState } from "./shared";

/* --------------------------------- schemas -------------------------------- */

const columnPlanSchema = z.object({
  excelIndex: z.number().int().min(0).max(16383),
  header: z.string().max(300),
  action: z.enum(["map", "create", "ignore"]),
  fieldId: z.string().trim().max(36).nullish(),
  create: z
    .object({
      name: z.string().trim().min(1, "Give the new column a name").max(160),
      fieldType: z.enum(FIELD_TYPES),
      required: z.boolean(),
      options: z.array(z.string().max(120)).max(500),
      helpText: z.string().max(300).nullable(),
      showInTable: z.boolean(),
      showInCard: z.boolean(),
      editable: z.boolean(),
    })
    .nullish(),
});

const mappingSchema = z.object({
  sheetName: z.string().trim().min(1).max(160),
  headerRow: z.number().int().min(1).max(1000),
  columns: z.array(columnPlanSchema),
});

const strategySchema = z.object({
  mode: z.enum(["append", "append_skip_duplicates", "update_existing"]),
  matchFieldId: z.string().trim().max(36).nullish(),
  createNewFields: z.boolean().optional(),
});

const saveImportConfigSchema = z.object({
  jobId: z.string().trim().min(1).max(36),
  sheetName: z.string().trim().min(1).max(160),
  headerRow: z.number().int().min(1).max(1000),
  registerName: z.string().trim().min(1).max(160).optional(),
  registerDescription: z.string().trim().max(2000).optional(),
  mapping: mappingSchema,
  strategy: strategySchema,
});

/* -------------------------------- helpers -------------------------------- */

/** Re-checks that the caller may still import into the job's target register. */
async function assertTargetRegisterImportable(registerId: string | null, session: Session) {
  if (!registerId) {
    throw notFound("The target register for this import no longer exists.");
  }
  const access = await getRegisterAccess(registerId, session);
  if (!access) {
    throw notFound("The target register for this import no longer exists or has been archived.");
  }
  assertPermission(access.permissions, "import");
  return access;
}

/* --------------------------------- config -------------------------------- */

/**
 * Saves the wizard configuration (sheet, header row, mapping, strategy) and
 * returns a preview validation summary. For a brand-new register the register
 * itself is created here, before its fields are validated against.
 */
export async function saveImportConfigAction(
  input: SaveImportConfigInput,
): Promise<ActionState & { data?: SaveImportConfigData }> {
  try {
    const session = await requireSessionOrThrow();

    const parsed = saveImportConfigSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const key = String(issue.path[0] ?? "form");
      return { ok: false, message: issue.message, errors: { [key]: issue.message } };
    }

    const job = await loadImportJobForSession(parsed.data.jobId, session);
    assertImportJobWritable(job);

    let registerId = job.targetRegisterId;

    if (!registerId && job.kind === "new_register") {
      await requireCapability("records:import");
      const name = (parsed.data.registerName ?? job.targetRegisterName ?? "").trim();
      if (name.length < 2) {
        throw new AppError("Enter a name for the new register (at least 2 characters).", 422, "validation");
      }
      const created = await createRegister(
        registerInputSchema.parse({
          name: name.slice(0, 160),
          description: parsed.data.registerDescription ?? null,
        }),
        session,
      );
      registerId = created.id;
      await db
        .update(importJobs)
        .set({ targetRegisterId: created.id, targetRegisterName: created.name })
        .where(eq(importJobs.id, job.id));
    }

    const target = await assertTargetRegisterImportable(registerId, session);
    registerId = target.register.id;

    const fields = target.fields;
    const fieldIds = new Set(fields.map((field) => field.id));
    for (const column of parsed.data.mapping.columns) {
      if (column.action === "map" && (!column.fieldId || !fieldIds.has(column.fieldId))) {
        throw new AppError(
          `Column "${column.header}" is linked to a register column that does not exist.`,
          422,
          "validation",
        );
      }
      if (column.action === "create" && !column.create?.name) {
        throw new AppError(`Column "${column.header}" needs a name for the new register column.`, 422, "validation");
      }
    }

    const strategy = parsed.data.strategy;
    if (strategy.matchFieldId && !fieldIds.has(strategy.matchFieldId)) {
      throw new AppError("The duplicate-matching column does not exist in this register.", 422, "validation");
    }
    if (strategy.mode !== "append" && !strategy.matchFieldId) {
      throw new AppError(
        "Choose the column that identifies an existing record — it is required for this import mode.",
        422,
        "validation",
      );
    }

    const mapping: ImportMapping = {
      sheetName: parsed.data.sheetName,
      headerRow: parsed.data.headerRow,
      columns: parsed.data.mapping.columns,
    };

    const saved = await db
      .update(importJobs)
      .set({
        mapping,
        strategy,
        sheetName: parsed.data.sheetName,
        headerRow: parsed.data.headerRow,
        targetRegisterId: registerId,
      })
      .where(and(eq(importJobs.id, job.id), inArray(importJobs.status, ["draft", "pending"])));
    if (affectedCount(saved) === 0) {
      throw new AppError("This import is no longer editable.", 409, "conflict");
    }

    const jobForValidation: ImportJob = {
      ...job,
      targetRegisterId: registerId,
      sheetName: parsed.data.sheetName,
      headerRow: parsed.data.headerRow,
      mapping,
      strategy,
    };
    const { maxImportRows } = getUploadLimits();
    const summary = await validateRows(jobForValidation, mapping, strategy, {
      maxRows: maxImportRows,
      all: false,
    });

    return { ok: true, message: "Import configuration saved.", data: { registerId, summary } };
  } catch (error) {
    return toActionState(error);
  }
}

/* ---------------------------------- start --------------------------------- */

/**
 * Runs the full validation pass, moves the job to `pending` and schedules the
 * execution after the response. Rows that fail validation are rejected
 * individually by the engine, so invalid rows never block the start — they are
 * surfaced in the returned counts instead.
 */
export async function startImportAction(
  jobId: string,
): Promise<ActionState & { data?: StartImportData }> {
  try {
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);

    if (job.status !== "draft" && job.status !== "pending") {
      throw new AppError(`This import is already ${job.status}.`, 409, "conflict");
    }

    const mapping = job.mapping as ImportMapping | null;
    const strategy = (job.strategy as ImportStrategy | null) ?? {
      mode: "append",
      createNewFields: true,
    };
    if (!mapping || !job.targetRegisterId) {
      throw new AppError("This import is not configured yet — save the column mapping first.", 422, "validation");
    }

    await assertTargetRegisterImportable(job.targetRegisterId, session);

    const uploadedChunks = await rawCount(
      sql`SELECT COUNT(*) AS count FROM import_chunks WHERE job_id = ${jobId}`,
    );
    if (uploadedChunks < job.chunkCount) {
      throw new AppError("The file has not finished uploading yet.", 422, "validation");
    }

    const { maxImportRows } = getUploadLimits();
    const summary = await validateRows(job, mapping, strategy, { maxRows: maxImportRows, all: true });

    const claimed = await db
      .update(importJobs)
      .set({ status: "pending", startedAt: job.startedAt ?? new Date() })
      .where(and(eq(importJobs.id, jobId), inArray(importJobs.status, ["draft", "pending"])));
    if (affectedCount(claimed) === 0) {
      throw new AppError("This import was already started.", 409, "conflict");
    }

    const { ip } = await requestMeta();
    await recordAudit({
      action: AUDIT_ACTIONS.IMPORT_STARTED,
      entityType: "import",
      entityId: jobId,
      registerId: job.targetRegisterId,
      summary: `Started import of "${job.filename}" (${summary.totalRows} rows, ${summary.invalidRows} invalid)`,
      metadata: {
        totalRows: summary.totalRows,
        invalidRows: summary.invalidRows,
        emptyRows: summary.emptyRows,
      },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    after(async () => {
      await processImportJob(jobId);
    });

    const rejectedNote =
      summary.invalidRows > 0
        ? ` ${summary.invalidRows} invalid row${summary.invalidRows === 1 ? "" : "s"} will be rejected during the import.`
        : "";

    return {
      ok: true,
      message: `Import started.${rejectedNote}`,
      data: {
        jobId,
        counts: {
          totalRows: summary.totalRows,
          invalidRows: summary.invalidRows,
          emptyRows: summary.emptyRows,
          duplicateRows: summary.duplicateRows,
        },
      },
    };
  } catch (error) {
    return toActionState(error);
  }
}

/* --------------------------------- cancel --------------------------------- */

export async function cancelImportAction(jobId: string): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);

    if (["completed", "partial", "failed", "cancelled"].includes(job.status)) {
      return { ok: false, message: "This import has already finished — there is nothing to cancel." };
    }

    const now = new Date();
    const immediate = job.status === "draft";
    await db
      .update(importJobs)
      .set(
        immediate
          ? { cancelRequested: true, status: "cancelled", finishedAt: now }
          : { cancelRequested: true },
      )
      .where(eq(importJobs.id, jobId));
    if (immediate) await deleteWorkbookChunks(jobId);

    const { ip } = await requestMeta();
    await recordAudit({
      action: AUDIT_ACTIONS.IMPORT_CANCELLED,
      entityType: "import",
      entityId: jobId,
      registerId: job.targetRegisterId,
      summary: immediate
        ? `Discarded draft import "${job.filename}"`
        : `Requested cancellation of running import "${job.filename}"`,
      metadata: { previousStatus: job.status, immediate },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    return {
      ok: true,
      message: immediate
        ? "The import was cancelled."
        : "Cancellation requested — the import stops after the current batch.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

/* ---------------------------------- reads --------------------------------- */

/** Polling helper: the job summary for the caller, or null when it does not exist. */
export async function getImportJobAction(jobId: string): Promise<ImportJobSummary | null> {
  try {
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);
    return importJobSummary(job);
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

/** Validation / engine errors for one job, ordered by worksheet row. */
export async function listImportErrorsAction(jobId: string, limit = 100): Promise<ImportErrorItem[]> {
  try {
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);

    const requested = Number.isFinite(limit) ? Math.floor(limit) : 100;
    const capped = Math.min(Math.max(1, requested), 1000);
    const rows = await db
      .select()
      .from(importErrors)
      .where(eq(importErrors.jobId, job.id))
      .orderBy(asc(importErrors.rowNumber), asc(importErrors.id))
      .limit(capped);

    return rows.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      columnName: row.columnName,
      code: row.code,
      message: row.message,
      severity: row.severity,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    if (error instanceof AppError) return [];
    throw error;
  }
}

/* --------------------------------- discard -------------------------------- */

/** Drops the uploaded chunks and marks a finished (or draft) job as cancelled. */
export async function discardImportAction(jobId: string): Promise<ActionState> {
  try {
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);

    if (!["draft", "completed", "cancelled", "failed"].includes(job.status)) {
      throw new AppError(
        `Cancel this import before discarding it (it is currently ${job.status}).`,
        409,
        "conflict",
      );
    }

    await deleteWorkbookChunks(jobId);
    await db
      .update(importJobs)
      .set({ status: "cancelled", finishedAt: job.finishedAt ?? new Date() })
      .where(eq(importJobs.id, jobId));

    const { ip } = await requestMeta();
    await recordAudit({
      action: AUDIT_ACTIONS.IMPORT_CANCELLED,
      entityType: "import",
      entityId: jobId,
      registerId: job.targetRegisterId,
      summary: `Discarded import "${job.filename}" (was ${job.status})`,
      metadata: { previousStatus: job.status },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    return { ok: true, message: "Import discarded." };
  } catch (error) {
    return toActionState(error);
  }
}
