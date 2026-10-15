import Link from "next/link";
import { Button } from "@/components/ui/button";
import { activityHref, type ActivityFilters } from "@/components/app/activity/filter-bar";

export function Pagination({
  filters,
  page,
  pageCount,
  total,
}: {
  filters: ActivityFilters;
  page: number;
  pageCount: number;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pageCount} · {total} event{total === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          asChild={page > 1}
        >
          {page > 1 ? (
            <Link href={activityHref(filters, page - 1)} rel="prev">
              Previous
            </Link>
          ) : (
            <span>Previous</span>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          asChild={page < pageCount}
        >
          {page < pageCount ? (
            <Link href={activityHref(filters, page + 1)} rel="next">
              Next
            </Link>
          ) : (
            <span>Next</span>
          )}
        </Button>
      </div>
    </div>
  );
}
