import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError, requireRegisterAccess, type RegisterPermissions } from "@/lib/auth/guard";
import { listActivity } from "@/server/activity";
import { getRecordById } from "@/server/records";
import { emptySlot, formatSlotForDisplay, slotToFormValue } from "@/lib/field-values";
import { formatDate, relativeTime } from "@/lib/utils";
import { PageHeader, PageSection } from "@/components/app/layout-primitives";
import { RegisterTabs } from "@/components/app/register-tabs";
import {
  RecordArchiveButton,
  RecordDetailPanel,
} from "@/components/app/records/record-detail-client";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Record" };

async function loadAccess(registerId: string, permission: keyof RegisterPermissions) {
  try {
    return await requireRegisterAccess(registerId, permission);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ registerId: string; recordId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { registerId, recordId } = await params;
  const sp = await searchParams;

  const { register, fields, permissions } = await loadAccess(registerId, "view");

  const full = await getRecordById(recordId);
  if (!full || full.record.registerId !== registerId) notFound();

  const record = full.record;
  const created = sp.created === "1";
  const initialEditing = sp.edit === "1";

  const cardFields = fields.filter((field) => field.showInCard);
  const remainingFields = fields.filter((field) => !field.showInCard);

  const defaultValues = Object.fromEntries(
    fields.map((field) => [
      field.id,
      slotToFormValue(field, full.values[field.id] ?? emptySlot()),
    ]),
  );

  const activity = await listActivity({
    registerId,
    entityType: "record",
    page: 1,
    pageSize: 50,
  });
  const recordActivity = activity.items.filter((entry) => entry.entityId === recordId);

  const view = (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This register has no columns, so this record has no values to display.
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {cardFields.map((field) => {
            const slot = full.values[field.id] ?? emptySlot();
            const text = formatSlotForDisplay(field, slot);
            return (
              <div key={field.id} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {field.name}
                </dt>
                <dd className="mt-1 break-words text-sm text-foreground">
                  {text || <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {remainingFields.length > 0 ? (
        <details className="rounded-md border border-border bg-muted/30 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {remainingFields.length} additional column{remainingFields.length === 1 ? "" : "s"}
          </summary>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {remainingFields.map((field) => {
              const slot = full.values[field.id] ?? emptySlot();
              const text = formatSlotForDisplay(field, slot);
              return (
                <div key={field.id} className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {field.name}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm text-foreground">
                    {text || <span className="text-muted-foreground">—</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </details>
      ) : null}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`Record #${record.serial}`}
        description={register.name}
        breadcrumb={
          <span className="inline-flex items-center gap-1">
            <Link href="/registers" className="hover:text-foreground">
              Registers
            </Link>
            <span aria-hidden>/</span>
            <Link href={`/registers/${registerId}`} className="hover:text-foreground">
              {register.name}
            </Link>
          </span>
        }
        actions={
          permissions.delete ? (
            <RecordArchiveButton
              registerId={registerId}
              recordId={recordId}
              archived={record.status === "archived"}
            />
          ) : null
        }
      />

      <RegisterTabs
        registerId={registerId}
        active="records"
        counts={{ fields: fields.length }}
      />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {created ? (
          <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
            Record created.
          </p>
        ) : null}

        {record.status === "archived" ? (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            This record is archived. It stays searchable from the register&apos;s Archived view
            and can be restored at any time.
          </p>
        ) : null}

        <PageSection
          title="Values"
          description="Every column of this register, as saved on the record."
        >
          <RecordDetailPanel
            registerId={registerId}
            recordId={recordId}
            fields={fields}
            defaultValues={defaultValues}
            dataVersion={record.dataVersion}
            canEdit={permissions.edit}
            initialEditing={initialEditing}
            view={view}
          />
        </PageSection>

        <div className="grid gap-4 lg:grid-cols-2">
          <PageSection title="Record details">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Serial number</dt>
                <dd className="tabular-nums font-medium">#{record.serial}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  {record.status === "archived" ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-right">
                  {formatDate(record.createdAt, true)}
                  <span className="block text-xs text-muted-foreground">
                    {relativeTime(record.createdAt)}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="text-right">
                  {formatDate(record.updatedAt, true)}
                  <span className="block text-xs text-muted-foreground">
                    {relativeTime(record.updatedAt)}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Version</dt>
                <dd className="tabular-nums font-medium">v{record.dataVersion}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Edits use optimistic concurrency: if someone else saves a change while you are
              editing, your save is refused so no one&apos;s work is silently overwritten.
            </p>
          </PageSection>

          <PageSection
            title="Recent activity"
            description="Audited actions recorded against this record."
          >
            {recordActivity.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No activity recorded for this record yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recordActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{entry.summary ?? entry.action}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.actorName ?? "—"} · {entry.actorEmail ?? "System"} · {entry.action}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
        </div>
      </div>
    </div>
  );
}
