import type { FilterClause, FilterOp } from "@/server/records";

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type RecordsStatus = "active" | "archived" | "all";

export type RecordsUrlState = {
  q: string;
  page: number;
  size: number;
  sort: string | null;
  dir: "asc" | "desc";
  status: RecordsStatus;
  filters: FilterClause[];
};

export const DEFAULT_RECORDS_STATE: RecordsUrlState = {
  q: "",
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  sort: null,
  dir: "asc",
  status: "active",
  filters: [],
};

export const FILTER_OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "starts", label: "starts with" },
  { value: "gt", label: "is greater than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];

const FILTER_OPS_SET = new Set<string>(FILTER_OPS.map((op) => op.value));
const MAX_FILTERS = 20;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function normalizeStatusFilter(raw: string): RecordsStatus {
  return raw === "archived" || raw === "all" ? raw : "active";
}

export function normalizePageSize(raw: number): number {
  return (PAGE_SIZES as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

export function decodeFilters(raw: string | undefined | null): FilterClause[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: FilterClause[] = [];
  for (const item of parsed.slice(0, MAX_FILTERS)) {
    if (!item || typeof item !== "object") continue;
    const clause = item as Record<string, unknown>;
    if (typeof clause.fieldId !== "string" || clause.fieldId.length === 0) continue;
    if (typeof clause.op !== "string" || !FILTER_OPS_SET.has(clause.op)) continue;
    out.push({
      fieldId: clause.fieldId.slice(0, 64),
      op: clause.op as FilterOp,
      ...(typeof clause.value === "string" && clause.value.length > 0
        ? { value: clause.value.slice(0, 500) }
        : {}),
      ...(typeof clause.value2 === "string" && clause.value2.length > 0
        ? { value2: clause.value2.slice(0, 500) }
        : {}),
    });
  }
  return out;
}

export function encodeFilters(filters: FilterClause[]): string {
  return JSON.stringify(filters);
}

export function parseRecordsSearchParams(
  params: Record<string, string | string[] | undefined>,
): RecordsUrlState {
  const q = firstValue(params.q).slice(0, 200);
  const page = Math.max(1, Math.floor(Number(firstValue(params.page)) || 1));
  const size = normalizePageSize(Math.floor(Number(firstValue(params.size)) || DEFAULT_PAGE_SIZE));
  const sortRaw = firstValue(params.sort).slice(0, 64);
  const dir: "asc" | "desc" = firstValue(params.dir) === "desc" ? "desc" : "asc";
  const status = normalizeStatusFilter(firstValue(params.status));
  const filters = decodeFilters(firstValue(params.filters) || null);

  return {
    q,
    page,
    size,
    sort: sortRaw || null,
    dir,
    status,
    filters,
  };
}

export function recordsStateToSearchParams(state: RecordsUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.status !== "active") params.set("status", state.status);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.size !== DEFAULT_PAGE_SIZE) params.set("size", String(state.size));
  if (state.sort) {
    params.set("sort", state.sort);
    params.set("dir", state.dir);
  }
  if (state.filters.length > 0) params.set("filters", encodeFilters(state.filters));
  return params;
}

export function recordsPathWithState(registerId: string, state: RecordsUrlState): string {
  const qs = recordsStateToSearchParams(state).toString();
  return `/registers/${registerId}${qs ? `?${qs}` : ""}`;
}

export function hasActiveQuery(state: Pick<RecordsUrlState, "q" | "filters">): boolean {
  return state.q.trim().length > 0 || state.filters.length > 0;
}

export function buildExportHref(
  registerId: string,
  state: Pick<RecordsUrlState, "q" | "status" | "sort" | "dir" | "filters">,
  format: "csv" | "xlsx",
  scope: "all" | "filtered" | "selected",
  ids?: string[],
): string {
  const params = new URLSearchParams();
  params.set("format", format);
  params.set("scope", scope);
  if (scope === "filtered") {
    if (state.q) params.set("q", state.q);
    if (state.status !== "active") params.set("status", state.status);
    if (state.sort) {
      params.set("sort", state.sort);
      params.set("dir", state.dir);
    }
    if (state.filters.length > 0) params.set("filters", encodeFilters(state.filters));
  }
  if (scope === "selected" && ids && ids.length > 0) {
    params.set("ids", ids.join(","));
  }
  return `/api/registers/${registerId}/export?${params.toString()}`;
}

export function parseIdsParam(raw: string | null | undefined, cap = 500): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ].slice(0, cap);
}
