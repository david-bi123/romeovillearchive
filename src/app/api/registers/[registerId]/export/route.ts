import { AppError, requireRegisterAccess } from "@/lib/auth/guard";
import {
  listRecordsByIds,
  listRecordsForExport,
  type RecordQuery,
  type RecordStatusFilter,
} from "@/server/records";
import {
  buildExportColumns,
  exportFilename,
  toCsv,
  toXlsx,
  type ExportRow,
} from "@/lib/excel/export";
import {
  decodeFilters,
  normalizeStatusFilter,
  parseIdsParam,
} from "@/components/app/records/url-state";

export const runtime = "nodejs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseSortParam(key: string | null, dir: string | null): RecordQuery["sort"] {
  if (!key) return null;
  const safeKey = key.slice(0, 64);
  return { key: safeKey, dir: dir === "desc" ? "desc" : "asc" };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ registerId: string }> },
): Promise<Response> {
  try {
    const { registerId } = await params;
    const url = new URL(request.url);

    const formatRaw = url.searchParams.get("format");
    const format = formatRaw === "csv" || formatRaw === "xlsx" ? formatRaw : null;
    if (!format) {
      return new Response("Invalid or missing format. Use format=csv or format=xlsx.", {
        status: 400,
      });
    }

    const scopeRaw = url.searchParams.get("scope") ?? "all";
    const scope =
      scopeRaw === "all" || scopeRaw === "filtered" || scopeRaw === "selected"
        ? scopeRaw
        : null;
    if (!scope) {
      return new Response("Invalid scope. Use scope=all, scope=filtered or scope=selected.", {
        status: 400,
      });
    }

    const { register, fields } = await requireRegisterAccess(registerId, "export");

    let items;
    if (scope === "selected") {
      const ids = parseIdsParam(url.searchParams.get("ids"), 500);
      if (ids.length === 0) {
        return new Response("No record ids supplied for a selected-records export.", {
          status: 400,
        });
      }
      items = await listRecordsByIds(ids, fields, registerId);
    } else {
      const status: RecordStatusFilter =
        scope === "all" ? "all" : normalizeStatusFilter(url.searchParams.get("status") ?? "");
      const query: RecordQuery =
        scope === "filtered"
          ? {
              registerId,
              search: url.searchParams.get("q") || undefined,
              sort: parseSortParam(
                url.searchParams.get("sort"),
                url.searchParams.get("dir"),
              ),
              filters: decodeFilters(url.searchParams.get("filters")),
            }
          : { registerId };
      items = await listRecordsForExport(query, fields, status);
    }

    const columns = buildExportColumns(fields, true);
    const rows: ExportRow[] = items.map((item) => ({
      id: item.id,
      serial: item.serial,
      values: item.values,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const filename = exportFilename(register.name, format, scope);

    if (format === "csv") {
      return new Response(toCsv(columns, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const buffer = toXlsx(columns, rows, register.name);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(error.message, { status: error.status });
    }
    console.error("[export] unexpected failure", error);
    return new Response("The export could not be completed.", { status: 500 });
  }
}
