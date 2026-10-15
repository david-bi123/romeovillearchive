import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { AppError, requireRegisterAccess, type RegisterPermissions } from "@/lib/auth/guard";
import {
  countRecordsForRegister,
  listRecordsWithStatus,
  type RecordQuery,
} from "@/server/records";
import { PageHeader } from "@/components/app/layout-primitives";
import { RegisterTabs } from "@/components/app/register-tabs";
import { RecordsView } from "@/components/app/records/records-view";
import { parseRecordsSearchParams } from "@/components/app/records/url-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Records" };

async function loadAccess(registerId: string, permission: keyof RegisterPermissions) {
  try {
    return await requireRegisterAccess(registerId, permission);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

export default async function RegisterRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ registerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { registerId } = await params;
  const rawSearchParams = await searchParams;
  const state = parseRecordsSearchParams(rawSearchParams);

  const { register, fields, permissions } = await loadAccess(registerId, "view");

  const allowedSortKeys = new Set([
    "serial",
    "createdAt",
    "updatedAt",
    "status",
    ...fields.map((field) => field.id),
  ]);
  const sortKey = state.sort && allowedSortKeys.has(state.sort) ? state.sort : null;

  const query: RecordQuery = {
    registerId,
    page: state.page,
    pageSize: state.size,
    sort: sortKey ? { key: sortKey, dir: state.dir } : null,
    filters: state.filters,
    search: state.q || undefined,
  };

  const [page, activeTotal] = await Promise.all([
    listRecordsWithStatus(query, fields, state.status),
    countRecordsForRegister(registerId),
  ]);

  const normalizedState = { ...state, sort: sortKey };
  const description = [
    register.description?.trim() || null,
    `${activeTotal.toLocaleString("en-GB")} active record${activeTotal === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title={register.name}
        description={description}
        breadcrumb={
          <Link href="/registers" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-3.5" />
            Registers
          </Link>
        }
        actions={
          permissions.create ? (
            <Button asChild size="sm">
              <Link href={`/registers/${registerId}/records/new`}>
                <Plus className="size-4" />
                New record
              </Link>
            </Button>
          ) : null
        }
      />

      <RegisterTabs
        registerId={registerId}
        active="records"
        counts={{ records: activeTotal, fields: fields.length }}
      />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <RecordsView
          key={registerId}
          registerId={registerId}
          fields={fields}
          state={normalizedState}
          permissions={permissions}
          page={page}
        />
      </div>
    </div>
  );
}
