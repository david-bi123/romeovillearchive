"use client";

import { FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildExportHref,
  type RecordsUrlState,
} from "@/components/app/records/url-state";

export function ExportMenu({
  registerId,
  state,
  scope,
  ids,
  size = "sm",
  variant = "outline",
  triggerLabel = "Export",
}: {
  registerId: string;
  state: Pick<RecordsUrlState, "q" | "status" | "sort" | "dir" | "filters">;
  scope: "all" | "filtered" | "selected";
  ids?: string[];
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost";
  triggerLabel?: string;
}) {
  const disabled = scope === "selected" && (!ids || ids.length === 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          <FileDown className="size-4" />
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export as</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={buildExportHref(registerId, state, "csv", scope, ids)} download>
            <FileDown className="size-4" />
            CSV file
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={buildExportHref(registerId, state, "xlsx", scope, ids)} download>
            <FileSpreadsheet className="size-4" />
            Excel workbook
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          {scope === "selected"
            ? `${ids?.length ?? 0} selected record${(ids?.length ?? 0) === 1 ? "" : "s"}`
            : scope === "filtered"
              ? "Matching your current search, filters and sort"
              : "Every record in this register"}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
