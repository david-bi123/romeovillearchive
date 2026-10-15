import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppError, requireRegisterAccess, type RegisterPermissions } from "@/lib/auth/guard";
import { PageHeader, EmptyState } from "@/components/app/layout-primitives";
import { RegisterTabs } from "@/components/app/register-tabs";
import { RecordForm } from "@/components/app/records/record-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "New record" };

async function loadAccess(registerId: string, permission: keyof RegisterPermissions) {
  try {
    return await requireRegisterAccess(registerId, permission);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

export default async function NewRecordPage({
  params,
}: {
  params: Promise<{ registerId: string }>;
}) {
  const { registerId } = await params;
  const { register, fields } = await loadAccess(registerId, "create");

  return (
    <div>
      <PageHeader
        title="New record"
        description={`Add a record to ${register.name}.`}
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
      />

      <RegisterTabs registerId={registerId} active="records" counts={{ fields: fields.length }} />

      <div className="max-w-3xl p-4 sm:p-6 lg:p-8">
        {fields.length === 0 ? (
          <EmptyState
            title="This register has no columns yet"
            description="Records are shaped by their columns. Ask an administrator to add columns on the Columns tab, then come back to create records."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={`/registers/${registerId}/fields`}>Open Columns tab</Link>
              </Button>
            }
          />
        ) : (
          <RecordForm mode="create" registerId={registerId} fields={fields} />
        )}
      </div>
    </div>
  );
}
