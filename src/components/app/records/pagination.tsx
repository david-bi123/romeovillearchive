"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZES } from "@/components/app/records/url-state";

function pageTokens(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const tokens: (number | "gap")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) tokens.push("gap");
  for (let index = start; index <= end; index += 1) tokens.push(index);
  if (end < pageCount - 1) tokens.push("gap");
  tokens.push(pageCount);
  return tokens;
}

export function RecordsPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const tokens = pageTokens(page, pageCount);

  return (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <p className="text-xs text-muted-foreground">
        {total.toLocaleString("en-GB")} record{total === 1 ? "" : "s"} · page {page} of{" "}
        {pageCount}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onSizeChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-[7.5rem] text-xs" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <div className="flex items-center gap-1">
          {tokens.map((token, index) =>
            token === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={token}
                size="sm"
                variant={token === page ? "secondary" : "ghost"}
                className="h-8 min-w-8 px-2 tabular-nums"
                onClick={() => onPageChange(token)}
                aria-current={token === page ? "page" : undefined}
              >
                {token}
              </Button>
            ),
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
