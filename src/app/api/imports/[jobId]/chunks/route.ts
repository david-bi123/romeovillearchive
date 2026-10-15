import { and, eq, sql } from "drizzle-orm";
import { assertSameOrigin, requireSessionOrThrow } from "@/lib/auth/guard";
import { db, rawRows } from "@/lib/db";
import { importChunks, importJobs } from "@/lib/db/schema";
import { getUploadLimits } from "@/lib/env";
import { assertImportJobWritable, importApiError, loadImportJobForSession } from "@/server/imports";

export const runtime = "nodejs";

const MAX_CHUNK_BYTES = 6 * 1024 * 1024;

async function storedBytes(jobId: string, excludeIndex: number | null): Promise<number> {
  const rows =
    excludeIndex === null
      ? await rawRows<{ total: number | string | null }>(
          sql`SELECT COALESCE(SUM(LENGTH(data)), 0) AS total FROM import_chunks WHERE job_id = ${jobId}`,
        )
      : await rawRows<{ total: number | string | null }>(
          sql`SELECT COALESCE(SUM(LENGTH(data)), 0) AS total FROM import_chunks WHERE job_id = ${jobId} AND chunk_index <> ${excludeIndex}`,
        );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Stores one chunk of the uploaded workbook.
 *
 * The index comes from the `x-chunk-index` header (0-based) and the body is
 * the raw chunk bytes. Re-sending an index overwrites it so client retries are
 * safe.
 *
 * Response: 200 { ok: true, received, expected } | 4xx/5xx { error, code }
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/imports/[jobId]/chunks">,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const { jobId } = await ctx.params;
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);
    assertImportJobWritable(job);

    const rawIndex = request.headers.get("x-chunk-index");
    const index = rawIndex === null ? Number.NaN : Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= job.chunkCount) {
      return Response.json(
        {
          error: `The x-chunk-index header must be an integer between 0 and ${Math.max(0, job.chunkCount - 1)}.`,
          code: "validation",
        },
        { status: 400 },
      );
    }

    const chunkLimit = Math.max(job.chunkSize, MAX_CHUNK_BYTES);
    const declared = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > chunkLimit) {
      return Response.json(
        { error: "This chunk is larger than the allowed chunk size.", code: "chunk_too_large" },
        { status: 413 },
      );
    }

    const data = Buffer.from(await request.arrayBuffer());
    if (data.length === 0) {
      return Response.json({ error: "The chunk body is empty.", code: "validation" }, { status: 400 });
    }
    if (data.length > chunkLimit) {
      return Response.json(
        { error: "This chunk is larger than the allowed chunk size.", code: "chunk_too_large" },
        { status: 413 },
      );
    }

    const { maxUploadBytes } = getUploadLimits();
    const otherBytes = await storedBytes(jobId, index);
    if (otherBytes + data.length > maxUploadBytes) {
      return Response.json(
        { error: "The uploaded chunks exceed the upload limit for this file.", code: "file_too_large" },
        { status: 413 },
      );
    }

    await db
      .insert(importChunks)
      .values({ id: crypto.randomUUID(), jobId, chunkIndex: index, data })
      .onDuplicateKeyUpdate({ set: { data } });

    const received = index + 1;
    if (received === job.chunkCount && job.fileSize === 0) {
      const total = await storedBytes(jobId, null);
      await db
        .update(importJobs)
        .set({ fileSize: total })
        .where(and(eq(importJobs.id, jobId), eq(importJobs.fileSize, 0)));
    }

    return Response.json({ ok: true, received, expected: job.chunkCount });
  } catch (error) {
    return importApiError(error);
  }
}
