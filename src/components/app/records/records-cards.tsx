"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Eye, FilePlus2, Inbox, Pencil, X } from "lucide-react";
import type { RecordListItem } from "@/server/records";
import type { RegisterField } from "@/lib/db/schema";
import type { RegisterPermissions } from "@/lib/auth/guard";
import { formatSlotForDisplay } from "@/lib/field-values";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/layout-primitives";
import { RecordsPagination } from "@/components/app/records/pagination";
import {
  hasActiveQuery,
  recordsStateToSearchParams,
  type RecordsUrlState,
} from "@/components/app/records/url-state";

const MAX_CARD_FIELDS = 6;

/**
 * Finds the register's status field: the first single-select field whose name
 * looks like a status column. Its value is shown as the card badge so teams
 * see workflow state (e.g. "In progress", "Completed") at a glance.
 */
function findStatusField(fields: RegisterField[]): RegisterField | null {
  return (
    fields.find(
      (field) => field.fieldType === "select" && /status/i.test(field.name),
    ) ?? null
  );
}

function StatusBadge({
  record,
  statusField,
}: {
  record: RecordListItem;
  statusField: RegisterField | null;
}) {
  if (record.status === "archived") {
    return <Badge variant="outline">Archived</Badge>;
  }
  if (statusField) {
    const slot = record.values[statusField.id];
    const text = slot ? formatSlotForDisplay(statusField, slot) : "";
    if (text) return <Badge variant="secondary">{text}</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

function RecordCard({
  registerId,
  record,
  fields,
  statusField,
  canEdit,
}: {
  registerId: string;
  record: RecordListItem;
  fields: RegisterField[];
  statusField: RegisterField | null;
  canEdit: boolean;
}) {
  const detailUrl = `/registers/${registerId}/records/${record.id}`;
  const rows = fields.filter((field) => field.id !== statusField?.id);
  const shown = rows.slice(0, MAX_CARD_FIELDS);
  const hiddenCount = rows.length - shown.length;
  const titleField = shown[0] ?? null;
  const titleSlot = titleField ? record.values[titleField.id] : undefined;
  const titleText =
    (titleSlot && titleField ? formatSlotForDisplay(titleField, titleSlot) : "") ||
    `Record #${record.serial}`;

  return (
    <article
      aria-label={titleText}
      className="flex flex-col rounded-lg border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-raised"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs tabular-nums text-muted-foreground">#{record.serial}</p>
          <h3 className="truncate text-sm font-semibold" title={titleText}>
            <Link href={detailUrl} className="hover:underline">
              {titleText}
            </Link>
          </h3>
        </div>
        <StatusBadge record={record} statusField={statusField} />
      </div>

      <dl className="mt-3 min-w-0 flex-1 space-y-1.5">
        {shown.map((field) => {
          const slot = record.values[field.id];
          const text = slot ? formatSlotForDisplay(field, slot) : "";
          return (
            <div key={field.id} className="flex min-w-0 items-baseline gap-2 text-sm">
              <dt className="w-24 shrink-0 truncate text-xs text-muted-foreground" title={field.name}>
                {field.name}
              </dt>
              <dd className="min-w-0 flex-1 truncate" title={text || undefined}>
                {text || <span className="text-muted-foreground">—</span>}
              </dd>
            </div>
          );
        })}
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No card fields configured.</p>
        ) : null}
        {hiddenCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            <Link href={detailUrl} className="hover:underline">
              +{hiddenCount} more field{hiddenCount === 1 ? "" : "s"}
            </Link>
          </p>
        ) : null}
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          Updated {relativeTime(record.updatedAt)}
        </span>
        <span className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={detailUrl}>
              <Eye className="size-4" />
              View
            </Link>
          </Button>
          {canEdit ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`${detailUrl}?edit=1`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          ) : null}
        </span>
      </div>
    </article>
  );
}

export function RecordsCards({
  registerId,
  items,
  fields,
  state,
  total,
  pageCount,
  permissions,
  onClearQuery,
}: {
  registerId: string;
  items: RecordListItem[];
  fields: RegisterField[];
  state: RecordsUrlState;
  total: number;
  pageCount: number;
  permissions: RegisterPermissions;
  onClearQuery: () => void;
}) {
  const router = useRouter();

  const pushState = useCallback(
    (patch: Partial<RecordsUrlState>) => {
      const next: RecordsUrlState = { ...state, ...patch };
      if (!("page" in patch)) next.page = 1;
      const qs = recordsStateToSearchParams(next).toString();
      router.push(`/registers/${registerId}${qs ? `?${qs}` : ""}`);
    },
    [state, registerId, router],
  );

  // Fields the team chose for cards; fall back to the first few visible
  // table fields so a register without card configuration still reads well.
  const configured = fields.filter((field) => field.showInCard);
  const cardFields = (configured.length > 0 ? configured : fields).slice(
    0,
    Math.max(MAX_CARD_FIELDS + 2, 8),
  );
  const statusField = findStatusField(fields);

  const queryActive = hasActiveQuery(state);
  const showEmpty = items.length === 0;

  if (showEmpty) {
    if (state.status === "archived" && !queryActive) {
      return (
        <EmptyState
          icon={<Inbox className="size-8" />}
          title="The archive is empty"
          description="Records you archive from this register will appear here and can be restored at any time."
        />
      );
    }
    if (queryActive) {
      return (
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
      );
    }
    return (
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
              <Link href={`/imports/new?registerId=${registerId}`}>Import records</Link>
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((record) => (
          <RecordCard
            key={record.id}
            registerId={registerId}
            record={record}
            fields={cardFields}
            statusField={statusField}
            canEdit={permissions.edit}
          />
        ))}
      </div>

      <RecordsPagination
        page={state.page}
        pageCount={pageCount}
        total={total}
        pageSize={state.size}
        onPageChange={(page) => pushState({ page })}
        onSizeChange={(size) => pushState({ size, page: 1 })}
      />
    </div>
  );
}
