import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { importJobs, type ImportJob } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/auth/guard";
import type { Session } from "@/lib/auth/session";
import type { ImportMapping, ImportStrategy, ValidationSummary } from "@/lib/import/engine";

/**
 * Shared import-job helpers used by the route handlers and the server actions
 * (job lookup with ownership checks, the polling payload, and the JSON error
 * mapping for API responses).
 */

export type ImportJobSummary = {
  id: string;
  status: ImportJob["status"];
  progress: number;
  rowsTotal: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsRejected: number;
  duplicatesFound: number;
  errorMessage: string | null;
  finishedAt: Date | null;
  filename: string;
  targetRegisterId: string | null;
};

export type ImportErrorItem = {
  id: string;
  rowNumber: number;
  columnName: string | null;
  code: string;
  message: string;
  severity: "error" | "warning";
  createdAt: Date;
};

export type SaveImportConfigInput = {
  jobId: string;
  sheetName: string;
  headerRow: number;
  registerName?: string;
  registerDescription?: string;
  mapping: ImportMapping;
  strategy: ImportStrategy;
};

export type SaveImportConfigData = {
  registerId: string;
  summary: ValidationSummary;
};

export type StartImportData = {
  jobId: string;
  counts: {
    totalRows: number;
    invalidRows: number;
    emptyRows: number;
    duplicateRows: number;
  };
};

export function importJobSummary(job: ImportJob): ImportJobSummary {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    rowsTotal: job.rowsTotal,
    rowsImported: job.rowsImported,
    rowsUpdated: job.rowsUpdated,
    rowsSkipped: job.rowsSkipped,
    rowsRejected: job.rowsRejected,
    duplicatesFound: job.duplicatesFound,
    errorMessage: job.errorMessage,
    finishedAt: job.finishedAt,
    filename: job.filename,
    targetRegisterId: job.targetRegisterId,
  };
}

/**
 * Loads a job the caller is allowed to see: the creator, an administrator or
 * the super administrator. Anything else answers like a missing job so job
 * ids cannot be probed.
 */
export async function loadImportJobForSession(jobId: string, session: Session): Promise<ImportJob> {
  const rows = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
  const job = rows[0];
  const isStaff = session.user.role === "super_admin" || session.user.role === "admin";
  if (!job || (job.createdByUserId !== session.user.id && !isStaff)) {
    throw notFound("Import job not found.");
  }
  return job;
}

export function assertImportJobWritable(job: ImportJob): void {
  if (job.status === "draft" || job.status === "pending") return;
  throw new AppError(
    `This import is ${job.status} and can no longer be changed.`,
    409,
    "conflict",
  );
}

/** Maps thrown errors onto a JSON response without leaking internals. */
export function importApiError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }

  const status = (error as { status?: unknown } | null)?.status;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Request failed.",
        code: typeof code === "string" ? code : "error",
      },
      { status },
    );
  }

  console.error("[api/imports] unexpected failure", error instanceof Error ? error.message : error);
  return Response.json(
    { error: "Something went wrong. Please try again.", code: "internal_error" },
    { status: 500 },
  );
}
