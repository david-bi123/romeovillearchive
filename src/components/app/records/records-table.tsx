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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  FilePlus2,
  Inbox,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { RecordListItem } from "@/server/records";
import type { FieldType, RegisterField } from "@/lib/db/schema";
import type { RegisterPermissions } from "@/lib/auth/guard";
import { emptySlot, formatSlotForDisplay, slotToFormValue } from "@/lib/field-values";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/app/layout-primitives";
import { CellEditor } from "@/components/app/records/cell-editor";
import { FIELD_TYPE_LABELS } from "@/components/app/records/field-input";
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
  bulkSaveRecordsAction,
  restoreRecordsAction,
} from "@/server/actions/records";
import { addFieldAction, updateFieldAction } from "@/server/actions/registers";
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

function AddColumnControl({
  registerId,
  blocked,
  onAdded,
}: {
  registerId: string;
  blocked: boolean;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      toast.error("Type a column name first.");
      return;
    }
    setBusy(true);
    try {
      const result = await addFieldAction({
        registerId,
        field: {
          name: trimmed,
          fieldType,
          required: false,
          options: [],
          showInTable: true,
          showInCard: true,
          editable: true,
        },
      });
      if (result.ok) {
        toast.success(result.message ?? "Column added.");
        setOpen(false);
        setName("");
        onAdded();
      } else {
        toast.error(result.message ?? "The column could not be added.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && blocked) {
          toast.error("Save or discard your row changes before changing columns.");
          return;
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Add a column"
          aria-label="Add a column"
        >
          <Plus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div>
          <p className="text-sm font-semibold">New column</p>
          <p className="text-xs text-muted-foreground">Appears in this register immediately.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-column-name">Column name</Label>
          <Input
            id="new-column-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Client Name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-column-type">Type</Label>
          <select
            id="new-column-type"
            value={fieldType}
            onChange={(event) => setFieldType(event.target.value as FieldType)}
            className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" className="w-full" disabled={busy} onClick={() => void add()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Adding…" : "Add column"}
        </Button>
      </PopoverContent>
    </Popover>
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

  /* ------------------------- spreadsheet edit mode ------------------------ */

  const [editing, setEditing] = useState(false);
  /** Full-row form values keyed by record id (every column, not just visible). */
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [addedRows, setAddedRows] = useState<Array<{ tempId: string; values: Record<string, unknown> }>>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const blankRowValues = useCallback(() => {
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      values[field.id] = field.fieldType === "multi_select" ? [] : (field.defaultValue ?? "");
    }
    return values;
  }, [fields]);

  const initialRowValues = useCallback(
    (record: RecordListItem) => {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        values[field.id] = slotToFormValue(field, record.values[field.id] ?? emptySlot());
      }
      return values;
    },
    [fields],
  );

  const enterEdit = useCallback(() => {
    const next: Record<string, Record<string, unknown>> = {};
    for (const record of items) next[record.id] = initialRowValues(record);
    setDrafts(next);
    setAddedRows([]);
    setDeletedIds(new Set());
    setRowErrors({});
    setDiscardArmed(false);
    clearSelection();
    setEditing(true);
  }, [items, initialRowValues]);

  const exitEdit = useCallback(() => {
    setEditing(false);
    setDrafts({});
    setAddedRows([]);
    setDeletedIds(new Set());
    setRowErrors({});
    setDiscardArmed(false);
    setRenamingFieldId(null);
  }, []);

  const dirtyUpdateIds = useMemo(() => {
    if (!editing) return [];
    return items.filter((record) => {
      const draft = drafts[record.id];
      if (!draft || deletedIds.has(record.id)) return false;
      return JSON.stringify(draft) !== JSON.stringify(initialRowValues(record));
    }).map((record) => record.id);
  }, [editing, items, drafts, deletedIds, initialRowValues]);

  const dirtyCount = dirtyUpdateIds.length + addedRows.length + deletedIds.size;

  const setDraftCell = useCallback((recordId: string, fieldId: string, value: unknown) => {
    setDrafts((prev) => ({
      ...prev,
      [recordId]: { ...(prev[recordId] ?? {}), [fieldId]: value },
    }));
  }, []);

  const setAddedCell = useCallback((tempId: string, fieldId: string, value: unknown) => {
    setAddedRows((prev) => prev.map((row) => (row.tempId === tempId ? { ...row, values: { ...row.values, [fieldId]: value } } : row)));
  }, []);

  const addRow = useCallback(() => {
    setAddedRows((prev) => [
      ...prev,
      { tempId: `new-${Date.now()}-${prev.length}`, values: blankRowValues() },
    ]);
  }, [blankRowValues]);

  const saveAll = useCallback(async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    setRowErrors({});
    try {
      const toSaveValues = (values: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const field of fields) {
          const value = values[field.id];
          if (field.fieldType === "multi_select" && typeof value === "string") {
            out[field.id] = value.split(",").map((part) => part.trim()).filter(Boolean);
          } else {
            out[field.id] = value ?? "";
          }
        }
        return out;
      };
      const updates = dirtyUpdateIds.map((recordId) => {
        const record = items.find((item) => item.id === recordId);
        return {
          recordId,
          dataVersion: record?.dataVersion ?? 1,
          values: toSaveValues(drafts[recordId] ?? {}),
        };
      });
      const creates = addedRows.map((row) => ({ values: toSaveValues(row.values) }));
      const deletes = [...deletedIds].filter((id) => items.some((item) => item.id === id));

      const formData = new FormData();
      formData.set("registerId", registerId);
      formData.set("payload", JSON.stringify({ updates, creates, deletes }));
      const result = await bulkSaveRecordsAction(IDLE, formData);

      if (result.ok) {
        toast.success(result.message ?? "All changes saved.");
        exitEdit();
        router.refresh();
        return;
      }

      const mapped: Record<string, string> = {};
      for (const [key, message] of Object.entries(result.errors ?? {})) {
        if (key.startsWith("update:") || key.startsWith("delete:")) {
          mapped[key.slice(7)] = message;
        } else if (key.startsWith("create:")) {
          const tempId = addedRows[Number(key.slice(7))]?.tempId;
          if (tempId) mapped[tempId] = message;
        }
      }
      setRowErrors(mapped);
      toast.error(result.message ?? "Some rows could not be saved.");
    } catch {
      toast.error("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [dirtyCount, dirtyUpdateIds, addedRows, deletedIds, drafts, fields, items, registerId, router, exitEdit]);

  const saveRename = useCallback(
    async (field: RegisterField) => {
      const name = renameValue.trim();
      if (!name) {
        toast.error("Type a column name first.");
        return;
      }
      if (name === field.name) {
        setRenamingFieldId(null);
        return;
      }
      const result = await updateFieldAction({
        registerId,
        fieldId: field.id,
        field: {
          name,
          fieldType: field.fieldType,
          required: field.required,
          helpText: field.helpText,
          defaultValue: field.defaultValue,
          options: (field.options as string[] | null) ?? [],
          showInTable: field.showInTable,
          showInCard: field.showInCard,
          editable: field.editable,
        },
      });
      if (result.ok) {
        toast.success(result.message ?? "Column renamed.");
        setRenamingFieldId(null);
        router.refresh();
      } else {
        toast.error(result.message ?? "The column could not be renamed.");
      }
    },
    [registerId, renameValue, router],
  );

  const columns = useMemo<ColumnDef<RecordListItem>[]>(() => {
    const headerSort = (label: string, sortKey: string, field?: RegisterField) => {
      if (editing && field && renamingFieldId === field.id) {
        return (
          <span className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveRename(field);
                if (event.key === "Escape") setRenamingFieldId(null);
              }}
              className="h-7 w-36 px-2 py-0 text-xs normal-case"
              aria-label={`Rename column ${field.name}`}
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              title="Save column name"
              aria-label="Save column name"
              onClick={() => void saveRename(field)}
            >
              <Save className="size-3.5" />
            </Button>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-foreground"
            onClick={() => toggleSort(sortKey)}
            aria-label={`Sort by ${label}`}
          >
            {label}
            <SortIndicator active={state.sort === sortKey} dir={state.dir} />
          </button>
          {editing && field ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              title={`Rename column ${field.name}`}
              aria-label={`Rename column ${field.name}`}
              onClick={() => {
                setRenamingFieldId(field.id);
                setRenameValue(field.name);
              }}
            >
              <Pencil className="size-3" />
            </button>
          ) : null}
        </span>
      );
    };

    const defs: ColumnDef<RecordListItem>[] = [
      editing
        ? {
            id: "remove",
            enableSorting: false,
            size: 44,
            header: () => <span className="sr-only">Remove row</span>,
            cell: ({ row }) => {
              const removed = deletedIds.has(row.original.id);
              return (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`size-7 ${removed ? "" : "text-muted-foreground hover:text-destructive"}`}
                  title={removed ? "Keep this row" : "Remove this row"}
                  aria-label={removed ? `Keep record ${row.original.serial}` : `Remove record ${row.original.serial}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeletedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.original.id)) next.delete(row.original.id);
                      else next.add(row.original.id);
                      return next;
                    });
                  }}
                >
                  {removed ? <Undo2 className="size-4" /> : <Trash2 className="size-4" />}
                </Button>
              );
            },
          }
        : {
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
        size: editing ? 260 : 220,
        header: () => headerSort(field.name, field.id, field),
        cell: ({ row }) => {
          const record = row.original;
          if (editing && field.editable && !deletedIds.has(record.id)) {
            const draft = drafts[record.id];
            const value = draft ? draft[field.id] : initialRowValues(record)[field.id];
            return (
              <CellEditor
                field={field}
                value={value}
                invalid={Boolean(rowErrors[record.id])}
                onChange={(next) => setDraftCell(record.id, field.id, next)}
              />
            );
          }
          const slot = record.values[field.id];
          const text = slot ? formatSlotForDisplay(field, slot) : "";
          return (
            <span className="block max-w-[22rem] truncate" title={text}>
              {text || <span className="text-muted-foreground">—</span>}
            </span>
          );
        },
      })),
      ...(editing && permissions.edit
        ? [
            {
              id: "add-column",
              enableSorting: false,
              size: 56,
              header: () => (
                <AddColumnControl
                  registerId={registerId}
                  blocked={dirtyCount > 0}
                  onAdded={() => router.refresh()}
                />
              ),
              cell: () => null,
            } as ColumnDef<RecordListItem>,
          ]
        : []),
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
        cell: ({ row }) => {
          const failure = editing ? rowErrors[row.original.id] : undefined;
          if (failure) {
            return (
              <span
                className="inline-flex size-7 items-center justify-center rounded-full bg-destructive-soft text-destructive"
                title={failure}
              >
                <AlertTriangle className="size-4" aria-label={`Row ${row.original.serial} failed to save: ${failure}`} role="img" />
              </span>
            );
          }
          if (editing) return <span className="text-muted-foreground">—</span>;
          return (
            <RowActions
              registerId={registerId}
              record={row.original}
              canEdit={permissions.edit}
              canDelete={permissions.delete}
            />
          );
        },
      },
    ];
    return defs;
  }, [visibleFields, state, registerId, permissions, toggleSort, editing, drafts, deletedIds, rowErrors, renamingFieldId, renameValue, dirtyCount, initialRowValues, setDraftCell, saveRename, router]);

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
  const showTable = !showEmpty || (editing && fields.length > 0);

  const failedRows = useMemo(
    () =>
      Object.entries(rowErrors).map(([key, message]) => {
        const record = items.find((item) => item.id === key);
        if (record) return { key, label: `Row #${record.serial}`, message };
        const addedIndex = addedRows.findIndex((row) => row.tempId === key);
        return {
          key,
          label: addedIndex >= 0 ? `New row ${addedIndex + 1}` : "A row",
          message,
        };
      }),
    [rowErrors, items, addedRows],
  );

  return (
    <div className="space-y-3">
      {permissions.edit ? (
        editing ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/50 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Pencil className="size-4" />
              Editing
              {dirtyCount > 0 ? (
                <span className="text-muted-foreground">
                  · {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">· no unsaved changes</span>
              )}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={addRow}>
                <Plus className="size-4" />
                Row
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (discardArmed) exitEdit();
                  else {
                    setDiscardArmed(true);
                    window.setTimeout(() => setDiscardArmed(false), 5000);
                  }
                }}
                title="Discard every unsaved change"
              >
                <X className="size-4" />
                {discardArmed ? "Click again to discard" : "Discard"}
              </Button>
              <Button type="button" size="sm" disabled={dirtyCount === 0 || saving} onClick={() => void saveAll()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {saving ? "Saving…" : "Save all changes"}
              </Button>
            </span>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={enterEdit} title="Edit cells, add and remove rows, then save everything together">
              <Pencil className="size-4" />
              Edit
            </Button>
          </div>
        )
      ) : null}

      {failedRows.length > 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
          <p className="font-medium">Some rows need attention — nothing else was lost.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {failedRows.map((row) => (
              <li key={row.key}>
                <span className="font-medium">{row.label}:</span> {row.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedIds.length > 0 && !editing ? (
        <BulkActions
          registerId={registerId}
          fields={fields}
          selectedIds={selectedIds}
          status={state.status}
          permissions={permissions}
          onClearSelection={clearSelection}
        />
      ) : null}

      {!showTable ? (
        fields.length === 0 ? (
          <EmptyState
            icon={<FilePlus2 className="size-8" />}
            title="Start with your first column"
            description="Type the column name exactly as it appears on your spreadsheet — for example Client Name — then add rows underneath it."
            action={
              permissions.edit ? (
                <span className="inline-flex items-center gap-2">
                  <AddColumnControl
                    registerId={registerId}
                    blocked={false}
                    onAdded={() => router.refresh()}
                  />
                  <span className="text-sm text-muted-foreground">Add your first column</span>
                </span>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/imports/new?registerId=${registerId}`}>Import records</Link>
                </Button>
              )
            }
          />
        ) : state.status === "archived" && !queryActive ? (
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
                      className={editing ? (deletedIds.has(row.original.id) ? "opacity-50" : undefined) : "cursor-pointer"}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      onClick={(event) => {
                        if (editing) return;
                        const target = event.target as HTMLElement;
                        if (
                          target.closest(
                            "button, a, input, select, textarea, label, [role='checkbox'], [role='menuitem'], [role='menu']",
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
                  {editing
                    ? addedRows.map((added, addedIndex) => {
                        const failure = rowErrors[added.tempId];
                        return (
                          <TableRow key={added.tempId} className="bg-muted/40">
                            <TableCell>
                              <span className="inline-flex size-7 items-center justify-center" title="New row — saved together with everything else">
                                <Plus className="size-4 text-muted-foreground" />
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="tabular-nums text-muted-foreground">New</span>
                            </TableCell>
                            {visibleFields.map((field) => (
                              <TableCell key={field.id}>
                                {field.editable ? (
                                  <CellEditor
                                    field={field}
                                    value={added.values[field.id]}
                                    invalid={Boolean(failure)}
                                    onChange={(next) => setAddedCell(added.tempId, field.id, next)}
                                  />
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            ))}
                            {editing && permissions.edit ? <TableCell /> : null}
                            <TableCell>
                              <Badge variant="secondary">New</Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">—</span>
                            </TableCell>
                            <TableCell>
                              {failure ? (
                                <span
                                  className="inline-flex size-7 items-center justify-center rounded-full bg-destructive-soft text-destructive"
                                  title={`New row ${addedIndex + 1}: ${failure}`}
                                >
                                  <AlertTriangle className="size-4" role="img" aria-label={`New row ${addedIndex + 1} failed to save: ${failure}`} />
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-destructive"
                                  title="Drop this new row"
                                  aria-label={`Drop new row ${addedIndex + 1}`}
                                  onClick={() =>
                                    setAddedRows((prev) => prev.filter((candidate) => candidate.tempId !== added.tempId))
                                  }
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    : null}
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
