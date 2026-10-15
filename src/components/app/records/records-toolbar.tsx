"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Columns3, Plus, Search as SearchIcon, Upload } from "lucide-react";
import type { FilterClause } from "@/server/records";
import type { RegisterField } from "@/lib/db/schema";
import type { RegisterPermissions } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExportMenu } from "@/components/app/records/export-menu";
import { ActiveFilterBadges, FilterDialog } from "@/components/app/records/filter-dialog";
import {
  DEFAULT_PAGE_SIZE,
  encodeFilters,
  recordsStateToSearchParams,
  type RecordsStatus,
  type RecordsUrlState,
} from "@/components/app/records/url-state";

const STATUS_OPTIONS: { value: RecordsStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All records" },
];

export function RecordsToolbar({
  registerId,
  fields,
  state,
  permissions,
  visibleFieldIds,
  onToggleColumn,
  onShowAllColumns,
}: {
  registerId: string;
  fields: RegisterField[];
  state: RecordsUrlState;
  permissions: RegisterPermissions;
  visibleFieldIds: string[];
  onToggleColumn: (fieldId: string) => void;
  onShowAllColumns: () => void;
}) {
  const router = useRouter();
  const basePath = `/registers/${registerId}`;

  const pushState = (patch: Partial<RecordsUrlState>) => {
    const next: RecordsUrlState = { ...state, ...patch };
    if (!("page" in patch)) next.page = 1;
    const qs = recordsStateToSearchParams(next).toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={basePath} method="get" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
          {state.status !== "active" ? (
            <input type="hidden" name="status" value={state.status} />
          ) : null}
          {state.sort ? (
            <>
              <input type="hidden" name="sort" value={state.sort} />
              <input type="hidden" name="dir" value={state.dir} />
            </>
          ) : null}
          {state.size !== DEFAULT_PAGE_SIZE ? (
            <input type="hidden" name="size" value={state.size} />
          ) : null}
          {state.filters.length > 0 ? (
            <input type="hidden" name="filters" value={encodeFilters(state.filters)} />
          ) : null}
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={state.q}
              placeholder="Search records…"
              className="pl-8"
              aria-label="Search records"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>

        <Select
          value={state.status}
          onValueChange={(value) => pushState({ status: value as RecordsStatus })}
        >
          <SelectTrigger className="h-9 w-[8.5rem] shrink-0 text-sm" aria-label="Record status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {permissions.view ? (
          <FilterDialog fields={fields} onApply={(filters) => pushState({ filters })} />
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="size-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {fields.map((field) => (
              <DropdownMenuCheckboxItem
                key={field.id}
                checked={visibleFieldIds.includes(field.id)}
                onCheckedChange={() => onToggleColumn(field.id)}
                onSelect={(event) => event.preventDefault()}
              >
                {field.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={visibleFieldIds.length === fields.length}
              onCheckedChange={() => onShowAllColumns()}
              onSelect={(event) => event.preventDefault()}
            >
              Show all columns
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {permissions.export ? (
          <ExportMenu
            registerId={registerId}
            state={state}
            scope="filtered"
            variant="outline"
          />
        ) : null}

        {permissions.import ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/imports/new?registerId=${registerId}`}>
              <Upload className="size-4" />
              Import
            </Link>
          </Button>
        ) : null}

        {permissions.create ? (
          <Button asChild size="sm">
            <Link href={`${basePath}/records/new`}>
              <Plus className="size-4" />
              New record
            </Link>
          </Button>
        ) : null}
      </div>

      <ActiveFilterBadges
        fields={fields}
        filters={state.filters}
        onRemove={(index) =>
          pushState({ filters: state.filters.filter((_, i) => i !== index) })
        }
        onClear={() => pushState({ filters: [] as FilterClause[] })}
      />
    </div>
  );
}
