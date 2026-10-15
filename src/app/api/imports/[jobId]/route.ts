import { requireSessionOrThrow } from "@/lib/auth/guard";
import { importApiError, importJobSummary, loadImportJobForSession } from "@/server/imports";

export const runtime = "nodejs";

/**
 * Polls the status of one import job.
 *
 * Response: 200 ImportJobSummary | 404 { error, code }
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/imports/[jobId]">,
): Promise<Response> {
  try {
    const { jobId } = await ctx.params;
    const session = await requireSessionOrThrow();
    const job = await loadImportJobForSession(jobId, session);
    return Response.json(importJobSummary(job));
  } catch (error) {
    return importApiError(error);
  }
}
