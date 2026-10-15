import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { assertSameOrigin, requireSessionOrThrow } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { importJobs, registerFields } from "@/lib/db/schema";
import { getUploadLimits } from "@/lib/env";
import { looksLikeSpreadsheet } from "@/lib/excel/workbook";
import {
  analyseWorkbook,
  assembleWorkbookBuffer,
  proposeTargetMapping,
} from "@/lib/import/engine";
import {
  assertImportJobWritable,
  importApiError,
  loadImportJobForSession,
} from "@/server/imports";

export const runtime = "nodejs";

const analyzeOptionsSchema = z.object({
  sheetName: z.string().trim().min(1).max(160).optional(),
  headerRow: z.number().int().min(1).max(1000).optional(),
});

/**
 * Reads the uploaded workbook and returns what the wizard needs for the
 * mapping step: sheet list, column profiles and a suggested mapping.
 *
 * POST body (optional): { sheetName?, headerRow? }
 * Response: 200 { sheets, profile, suggestedMapping } | 4xx/5xx { error, code }
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/imports/[jobId]/analyze">,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const { jobId } = await ctx.params;
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);
    assertImportJobWritable(job);

    const rawBody = (await request.text()).trim();
    let options: z.infer<typeof analyzeOptionsSchema> = {};
    if (rawBody) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return Response.json(
          { error: "The request body is not valid JSON.", code: "bad_request" },
          { status: 400 },
        );
      }
      const parsed = analyzeOptionsSchema.safeParse(parsedBody);
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0].message, code: "validation" },
          { status: 400 },
        );
      }
      options = parsed.data;
    }

    const buffer = await assembleWorkbookBuffer(job.id);
    if (!looksLikeSpreadsheet(buffer)) {
      return Response.json(
        { error: "The uploaded file is not a readable spreadsheet.", code: "unsupported_file" },
        { status: 400 },
      );
    }

    const { maxImportRows } = getUploadLimits();
    const { sheets, profile } = await analyseWorkbook(buffer, {
      sheetName: options.sheetName,
      headerRow: options.headerRow,
      maxRows: maxImportRows,
    });

    const sheetName = profile?.sheetName ?? options.sheetName ?? null;
    const headerRow = profile?.headerRow ?? Math.max(1, options.headerRow ?? job.headerRow);

    await db
      .update(importJobs)
      .set({ sheetName, headerRow, fileSize: buffer.length })
      .where(eq(importJobs.id, job.id));

    const fields =
      job.kind === "existing_register" && job.targetRegisterId
        ? await db
            .select()
            .from(registerFields)
            .where(eq(registerFields.registerId, job.targetRegisterId))
            .orderBy(asc(registerFields.displayOrder), asc(registerFields.id))
        : [];

    const suggestedMapping = profile ? proposeTargetMapping(profile.headers, fields) : [];

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    await recordAudit({
      action: AUDIT_ACTIONS.IMPORT_CREATED,
      entityType: "import",
      entityId: job.id,
      registerId: job.targetRegisterId,
      summary: `Analysed workbook "${job.filename}"${sheetName ? ` (sheet "${sheetName}")` : ""}`,
      metadata: {
        stage: "analyse",
        sheetName,
        headerRow,
        headers: profile?.headers.length ?? 0,
      },
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });

    return Response.json({ sheets, profile, suggestedMapping });
  } catch (error) {
    return importApiError(error);
  }
}
