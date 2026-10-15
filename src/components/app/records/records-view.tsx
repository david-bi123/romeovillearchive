"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table2 } from "lucide-react";
import type { RecordPage } from "@/server/records";
import type { RegisterField } from "@/lib/db/schema";
import type { RegisterPermissions } from "@/lib/auth/guard";
import { Button } from "@/components/ui/button";
import { RecordsCards } from "@/components/app/records/records-cards";
import { RecordsTable } from "@/components/app/records/records-table";
import { RecordsToolbar } from "@/components/app/records/records-toolbar";
import { recordsPathWithState, type RecordsUrlState } from "@/components/app/records/url-state";

type RecordsViewMode = "table" | "cards";

function viewStorageKey(registerId: string): string {
  return `rv-records-view:${registerId}`;
}

function readStoredView(registerId: string): RecordsViewMode {
  if (typeof window === "undefined") return "table";
  try {
    return window.localStorage.getItem(viewStorageKey(registerId)) === "cards"
      ? "cards"
      : "table";
  } catch {
    return "table";
  }
}

export function RecordsView({
  registerId,
  fields,
  state,
  permissions,
  page,
}: {
  registerId: string;
  fields: RegisterField[];
  state: RecordsUrlState;
  permissions: RegisterPermissions;
  page: RecordPage;
}) {
  const router = useRouter();
  const [view, setView] = useState<RecordsViewMode>(() => readStoredView(registerId));

  useEffect(() => {
    setView(readStoredView(registerId));
  }, [registerId]);

  const changeView = (next: RecordsViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(viewStorageKey(registerId), next);
    } catch {
      // Private browsing or disabled storage: the toggle still works for
      // this page load, the preference just is not remembered.
    }
  };

  const [visibleFieldIds, setVisibleFieldIds] = useState<string[]>(() =>
    fields.filter((field) => field.showInTable).map((field) => field.id),
  );

  const visibleFields = useMemo(
    () => fields.filter((field) => visibleFieldIds.includes(field.id)),
    [fields, visibleFieldIds],
  );

  const toggleColumn = (fieldId: string) => {
    setVisibleFieldIds((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : fields
            .filter((field) => prev.includes(field.id) || field.id === fieldId)
            .map((field) => field.id),
    );
  };

  const showAllColumns = () => setVisibleFieldIds(fields.map((field) => field.id));

  return (
    <div className="space-y-4">
      <RecordsToolbar
        registerId={registerId}
        fields={fields}
        state={state}
        permissions={permissions}
        visibleFieldIds={visibleFieldIds}
        onToggleColumn={toggleColumn}
        onShowAllColumns={showAllColumns}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {page.total.toLocaleString("en-GB")} record{page.total === 1 ? "" : "s"}
          {view === "cards" ? " · card view" : ""}
        </p>
        <div
          role="group"
          aria-label="Records layout"
          className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
        >
          <Button
            type="button"
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            onClick={() => changeView("table")}
            aria-pressed={view === "table"}
            title="Table view"
          >
            <Table2 className="size-4" />
            Table
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "cards" ? "secondary" : "ghost"}
            onClick={() => changeView("cards")}
            aria-pressed={view === "cards"}
            title="Card view"
          >
            <LayoutGrid className="size-4" />
            Cards
          </Button>
        </div>
      </div>
      {view === "cards" ? (
        <RecordsCards
          registerId={registerId}
          items={page.items}
          fields={fields}
          state={state}
          total={page.total}
          pageCount={page.pageCount}
          permissions={permissions}
          onClearQuery={() => {
            router.push(
              recordsPathWithState(registerId, { ...state, q: "", filters: [], page: 1 }),
            );
          }}
        />
      ) : (
        <RecordsTable
          registerId={registerId}
          items={page.items}
          fields={fields}
          visibleFields={visibleFields}
          state={state}
          total={page.total}
          pageCount={page.pageCount}
          permissions={permissions}
          onClearQuery={() => {
            router.push(
              recordsPathWithState(registerId, { ...state, q: "", filters: [], page: 1 }),
            );
          }}
        />
      )}
    </div>
  );
}
