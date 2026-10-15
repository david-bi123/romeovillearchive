import { Search, X } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export type ActivityFilters = {
  action: string;
  entity: string;
  from: string;
  to: string;
  q: string;
};

export function activityHref(filters: ActivityFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.q) params.set("q", filters.q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

export function FilterBar({
  filters,
  actions,
  dateWarning,
}: {
  filters: ActivityFilters;
  actions: string[];
  dateWarning: string | null;
}) {
  const active =
    Boolean(filters.action) ||
    Boolean(filters.entity) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.q);

  return (
    <form method="get" action="/activity" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1.5">
          <Label htmlFor="action">Action</Label>
          <select id="action" name="action" defaultValue={filters.action} className={SELECT_CLASS}>
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="entity">Entity type</Label>
          <Input
            id="entity"
            name="entity"
            defaultValue={filters.entity}
            placeholder="record"
            maxLength={60}
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="w-56 space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="Summary or actor email"
            maxLength={200}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            <Search className="size-4" />
            Apply
          </Button>
          {active ? (
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link href="/activity" aria-label="Clear all filters">
                <X className="size-4" />
                Clear
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {active ? <Badge variant="info">Filters active</Badge> : null}
        {dateWarning ? (
          <p className="text-xs text-warning">{dateWarning}</p>
        ) : null}
      </div>
    </form>
  );
}
