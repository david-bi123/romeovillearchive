import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import {
  assertPermission,
  assertSameOrigin,
  getRegisterAccess,
  notFound,
  requireCapability,
  requireSessionOrThrow,
} from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { getUploadLimits } from "@/lib/env";
import { isAcceptedFilename } from "@/lib/excel/workbook";
import { assertRateLimit } from "@/lib/rate-limit";
import { importApiError } from "@/server/imports";

export const runtime = "nodejs";

const MAX_CHUNK_COUNT = 512;
const MAX_CHUNK_BYTES = 6 * 1024 * 1024;

const createImportSchema = z.object({
  registerId: z.string().trim().min(1).max(36).nullish(),
  registerName: z.string().trim().min(1).max(160).optional(),
  registerTitle: z.string().trim().min(1).max(160).optional(),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(120).optional(),
  fileSize: z.number().int().min(0),
  checksum: z.string().trim().max(64).optional(),
  chunkCount: z.number().int().min(1),
  chunkSize: z.number().int().min(1),
});

/**
 * Creates an import job (status `draft`) before any chunk is uploaded.
 *
 * POST body: { registerId?, registerName?, registerTitle?, filename,
 *             mimeType?, fileSize, checksum?, chunkCount, chunkSize }
 * Response:  201 { jobId, kind } | 4xx/5xx { error, code }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireSessionOrThrow();
    // No import-specific bucket exists in RATE_LIMITS; the export bucket is the
    // closest per-user job-shaped limit, keyed so it never collides with it.
    await assertRateLimit(
      "export",
      `import:${session.user.id}`,
      "Too many import jobs were started. Please wait a moment before starting another.",
    );

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json(
        { error: "The request body is not valid JSON.", code: "bad_request" },
        { status: 400 },
      );
    }

    const parsed = createImportSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return Response.json(
        { error: issue.message, code: "validation" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (!isAcceptedFilename(body.filename)) {
      return Response.json(
        { error: "Only .xlsx, .xls and .xlsm files can be imported.", code: "unsupported_file" },
        { status: 400 },
      );
    }

    const { maxUploadBytes } = getUploadLimits();
    if (body.fileSize > maxUploadBytes) {
      return Response.json(
        {
          error: `The file exceeds the ${Math.round(maxUploadBytes / (1024 * 1024))} MB upload limit.`,
          code: "file_too_large",
        },
        { status: 413 },
      );
    }
    if (body.chunkCount > MAX_CHUNK_COUNT) {
      return Response.json(
        { error: `An upload can use at most ${MAX_CHUNK_COUNT} chunks.`, code: "validation" },
        { status: 400 },
      );
    }
    if (body.chunkSize > MAX_CHUNK_BYTES) {
      return Response.json(
        { error: "The requested chunk size is too large.", code: "validation" },
        { status: 400 },
      );
    }

    let kind: "new_register" | "existing_register";
    let targetRegisterName: string;

    if (body.registerId) {
      const access = await getRegisterAccess(body.registerId, session);
      if (!access) throw notFound("Register not found.");
      assertPermission(access.permissions, "import");
      kind = "existing_register";
      targetRegisterName = access.register.name;
    } else {
      await requireCapability("records:import");
      const name = (body.registerName ?? body.registerTitle ?? "").trim();
      if (name.length < 2) {
        return Response.json(
          { error: "Enter a name for the new register (at least 2 characters).", code: "validation" },
          { status: 400 },
        );
      }
      kind = "new_register";
      targetRegisterName = name.slice(0, 160);
    }

    const jobId = crypto.randomUUID();
    await db.insert(importJobs).values({
      id: jobId,
      kind,
      status: "draft",
      targetRegisterId: body.registerId ?? null,
      targetRegisterName,
      filename: body.filename.slice(0, 255),
      mimeType: body.mimeType ?? null,
      fileSize: body.fileSize,
      checksum: body.checksum ?? null,
      chunkCount: body.chunkCount,
      chunkSize: body.chunkSize,
      createdByUserId: session.user.id,
    });

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;

    await recordAudit({
      action: AUDIT_ACTIONS.IMPORT_CREATED,
      entityType: "import",
      entityId: jobId,
      registerId: body.registerId ?? null,
      summary: `Created import job for "${targetRegisterName}" from ${body.filename}`,
      metadata: { kind, filename: body.filename, fileSize: body.fileSize, chunkCount: body.chunkCount },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    return Response.json({ jobId, kind }, { status: 201 });
  } catch (error) {
    return importApiError(error);
  }
}
