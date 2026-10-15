"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useRef, useState, useActionState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FilePlus2,
  Inbox,
  MoreHorizontal,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { RecordListItem } from "@/server/records";
import type { RegisterField } from "@/lib/db/schema";
import type { RegisterPermissions } from "@/lib/auth/guard";
import { formatSlotForDisplay } from "@/lib/field-values";
import { relativeTime } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/layout-primitives";
import { ExportMenu } from "@/components/app/records/export-menu";
import { RecordsPagination } from "@/components/app/records/pagination";
import { SetFieldDialog } from "@/components/app/records/set-field-dialog";
import {
  hasActiveQuery,
  recordsStateToSearchParams,
  type RecordsUrlState,
} from "@/components/app/records/url-state";
import {
  archiveRecordsAction,
  restoreRecordsAction,
} from "@/server/actions/records";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-50" />;
  return dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

function RowActions({
  registerId,
  record,
  canEdit,
  canDelete,
}: {
  registerId: string;
  record: RecordListItem;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const detailUrl = `/registers/${registerId}/records/${record.id}`;
  const archived = record.status === "archived";

  const clientAction = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = archived
      ? await restoreRecordsAction(_prev, formData)
      : await archiveRecordsAction(_prev, formData);
    if (result.ok) {
      toast.success(result.message ?? (archived ? "Record restored." : "Record archived."));
      router.refresh();
    } else if (result.message) {
      toast.error(result.message);
    }
    return result;
  };

  const [, formAction, pending] = useActionState(clientAction, IDLE);

  return (
    <form ref={formRef} action={formAction} id={formId} className="inline-flex">
      <input type="hidden" name="registerId" value={registerId} />
      <input type="hidden" name="ids" value={record.id} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Actions for record ${record.serial}`}
            onClick={(event) => event.stopPropagation()}
            disabled={pending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => router.push(detailUrl)}>
            <Eye className="size-4" />
            View
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem onSelect={() => router.push(`${detailUrl}?edit=1`)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              {archived ? (
                <DropdownMenuItem
                  onSelect={() => {
                    formRef.current?.requestSubmit();
                  }}
                >
                  <ArchiveRestore className="size-4" />
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setConfirmOpen(true);
                  }}
                >
                  <Archive className="size-4" />
                  Archive
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive record #{record.serial}?</AlertDialogTitle>
            <AlertDialogDescription>
              The record moves to the archive and stops appearing in the active list. You can
              restore it later from the Archived view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="submit" form={formId} variant="destructive">
                Archive record
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function BulkActions({
  registerId,
  fields,
  selectedIds,
  status,
  permissions,
  onClearSelection,
}: {
  registerId: string;
  fields: RegisterField[];
  selectedIds: string[];
  status: RecordsUrlState["status"];
  permissions: RegisterPermissions;
  onClearSelection: () => void;
}) {
  const router = useRouter();
  const archiveFormId = useId();
  const restoreFormId = useId();
  const count = selectedIds.length;
  const viewingArchived = status === "archived";

  const archiveClientAction = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = await archiveRecordsAction(_prev, formData);
    if (result.ok) {
      toast.success(result.message ?? "Records archived.");
      onClearSelection();
      router.refresh();
    } else if (result.message) {
      toast.error(result.message);
    }
    return result;
  };

  const restoreClientAction = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = await restoreRecordsAction(_prev, formData);
    if (result.ok) {
      toast.success(result.message ?? "Records restored.");
      onClearSelection();
      router.refresh();
    } else if (result.message) {
      toast.error(result.message);
    }
    return result;
  };

  const [archiveState, archiveFormAction, archivePending] = useActionState(
    archiveClientAction,
    IDLE,
  );
  const [restoreState, restoreFormAction, restorePending] = useActionState(
    restoreClientAction,
    IDLE,
  );

  const busy = archivePending || restorePending;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/50 px-3 py-2">
      <span className="text-sm font-medium">
        {count} record{count === 1 ? "" : "s"} selected
      </span>
      <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={busy}>
        <X className="size-4" />
        Clear
      </Button>

      {permissions.edit ? (
        <SetFieldDialog
          registerId={registerId}
          fields={fields}
          selectedCount={count}
          selectedIds={selectedIds}
          onCompleted={() => {
            onClearSelection();
            router.refresh();
          }}
        />
      ) : null}

      {permissions.export ? (
        <ExportMenu
          registerId={registerId}
          state={{ q: "", status, sort: null, dir: "asc", filters: [] }}
          scope="selected"
          ids={selectedIds}
          variant="secondary"
          triggerLabel={`Export ${count}`}
        />
      ) : null}

      {permissions.delete ? (
        viewingArchived ? (
          <>
            <form action={restoreFormAction} id={restoreFormId} className="hidden">
              <input type="hidden" name="registerId" value={registerId} />
              <input type="hidden" name="ids" value={selectedIds.join(",")} />
            </form>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="secondary" disabled={busy}>
                  <ArchiveRestore className="size-4" />
                  Restore
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Restore {count} record{count === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The selected records return to the active list of this register.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button type="submit" form={restoreFormId}>
                      Restore
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <form action={archiveFormAction} id={archiveFormId} className="hidden">
              <input type="hidden" name="registerId" value={registerId} />
              <input type="hidden" name="ids" value={selectedIds.join(",")} />
            </form>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={busy}>
                  <Archive className="size-4" />
                  Archive
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Archive {count} record{count === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    They move to the archive and stop appearing in the active list. You can
                    restore them later from the Archived view.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button type="submit" form={archiveFormId} variant="destructive">
                      Archive
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )
      ) : null}

      {archiveState.message && !archiveState.ok ? (
        <span className="text-xs text-destructive">{archiveState.message}</span>
      ) : restoreState.message && !restoreState.ok ? (
        <span className="text-xs text-destructive">{restoreState.message}</span>
      ) : null}
    </div>
  );
}

export function RecordsTable({
  registerId,
  items,
  fields,
  visibleFields,
  state,
  total,
  pageCount,
  permissions,
  onClearQuery,
}: {
  registerId: string;
  items: RecordListItem[];
  fields: RegisterField[];
  visibleFields: RegisterField[];
  state: RecordsUrlState;
  total: number;
  pageCount: number;
  permissions: RegisterPermissions;
  onClearQuery: () => void;
}) {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const pushState = useCallback(
    (patch: Partial<RecordsUrlState>) => {
      const next: RecordsUrlState = { ...state, ...patch };
      if (!("page" in patch)) next.page = 1;
      const qs = recordsStateToSearchParams(next).toString();
      router.push(`/registers/${registerId}${qs ? `?${qs}` : ""}`);
    },
    [state, registerId, router],
  );

  const toggleSort = useCallback(
    (key: string) => {
      if (state.sort !== key) pushState({ sort: key, dir: "asc" });
      else if (state.dir === "asc") pushState({ sort: key, dir: "desc" });
      else pushState({ sort: null, dir: "desc" });
    },
    [pushState, state.sort, state.dir],
  );

  const selectedIds = useMemo(
    () => Object.entries(rowSelection).filter(([, selected]) => selected).map(([id]) => id),
    [rowSelection],
  );

  const clearSelection = () => setRowSelection({});

  const columns = useMemo<ColumnDef<RecordListItem>[]>(() => {
    const headerSort = (label: string, sortKey: string) => (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-foreground"
        onClick={() => toggleSort(sortKey)}
      >
        {label}
        <SortIndicator active={state.sort === sortKey} dir={state.dir} />
      </button>
    );

    const defs: ColumnDef<RecordListItem>[] = [
      {
        id: "select",
        enableSorting: false,
        size: 44,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
            aria-label="Select all records on this page"
            onClick={(event) => event.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
            aria-label={`Select record ${row.original.serial}`}
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      {
        id: "serial",
        enableSorting: false,
        size: 72,
        header: () => headerSort("S/N", "serial"),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">#{row.original.serial}</span>
        ),
      },
      ...visibleFields.map<ColumnDef<RecordListItem>>((field) => ({
        id: field.id,
        enableSorting: true,
        size: 220,
        header: () => headerSort(field.name, field.id),
        cell: ({ row }) => {
          const slot = row.original.values[field.id];
          const text = slot ? formatSlotForDisplay(field, slot) : "";
          return (
            <span className="block max-w-[22rem] truncate" title={text}>
              {text || <span className="text-muted-foreground">—</span>}
            </span>
          );
        },
      })),
      {
        id: "status",
        enableSorting: false,
        size: 96,
        header: () => headerSort("Status", "status"),
        cell: ({ row }) =>
          row.original.status === "archived" ? (
            <Badge variant="outline">Archived</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          ),
      },
      {
        id: "updatedAt",
        enableSorting: false,
        size: 110,
        header: () => headerSort("Updated", "updatedAt"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {relativeTime(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        size: 56,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            registerId={registerId}
            record={row.original}
            canEdit={permissions.edit}
            canDelete={permissions.delete}
          />
        ),
      },
    ];
    return defs;
  }, [visibleFields, state, registerId, permissions, toggleSort]);

  const table = useReactTable({
    data: items,
    columns,
    state: { rowSelection },
    onRowSelectionChange: (updater) => {
      setRowSelection((prev) =>
        typeof updater === "function" ? updater(prev) : updater,
      );
    },
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    enableSortingRemoval: false,
  });

  const queryActive = hasActiveQuery(state);
  const showEmpty = items.length === 0;

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 ? (
        <BulkActions
          registerId={registerId}
          fields={fields}
          selectedIds={selectedIds}
          status={state.status}
          permissions={permissions}
          onClearSelection={clearSelection}
        />
      ) : null}

      {showEmpty ? (
        state.status === "archived" && !queryActive ? (
          <EmptyState
            icon={<Inbox className="size-8" />}
            title="The archive is empty"
            description="Records you archive from this register will appear here and can be restored at any time."
          />
        ) : queryActive ? (
          <EmptyState
            icon={<Inbox className="size-8" />}
            title="No records match your view"
            description="Try a different search term, adjust the filters, or switch the status filter."
            action={
              <Button variant="outline" size="sm" onClick={onClearQuery}>
                <X className="size-4" />
                Clear search and filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FilePlus2 className="size-8" />}
            title="No records yet"
            description="Add the first record by hand, or import a spreadsheet to fill this register in bulk."
            action={
              permissions.create ? (
                <Button asChild size="sm">
                  <Link href={`/registers/${registerId}/records/new`}>
                    <FilePlus2 className="size-4" />
                    New record
                  </Link>
                </Button>
              ) : permissions.import ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/imports/new?registerId=${registerId}`}>
                    Import records
                  </Link>
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <>
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-border scrollbar-thin">
            <Table className="table-sticky-header">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className="bg-surface whitespace-nowrap"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (
                        target.closest(
                          "button, a, input, label, [role='checkbox'], [role='menuitem'], [role='menu']",
                        )
                      ) {
                        return;
                      }
                      router.push(`/registers/${registerId}/records/${row.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <RecordsPagination
            page={state.page}
            pageCount={pageCount}
            total={total}
            pageSize={state.size}
            onPageChange={(page) => pushState({ page })}
            onSizeChange={(size) => pushState({ size, page: 1 })}
          />
        </>
      )}
    </div>
  );
}
