"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordPage } from "@/server/records";
import type { RegisterField } from "@/lib/db/schema";
import type { RegisterPermissions } from "@/lib/auth/guard";
import { RecordsTable } from "@/components/app/records/records-table";
import { RecordsToolbar } from "@/components/app/records/records-toolbar";
import { recordsPathWithState, type RecordsUrlState } from "@/components/app/records/url-state";

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
    </div>
  );
}
