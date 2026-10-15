import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireRegisterAccess, requireSession } from "@/lib/auth/guard";
import { roleHasCapability } from "@/lib/auth/rbac";
import { getUploadLimits } from "@/lib/env";
import { listImportableRegisters } from "@/server/imports-list";
import { PageHeader, EmptyState } from "@/components/app/layout-primitives";
import { Button } from "@/components/ui/button";
import { ImportWizard } from "@/components/app/imports/import-wizard";
import type { FieldType } from "@/lib/db/schema";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ registerId?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const registerId = params.registerId?.trim();

  const canImport = roleHasCapability(session.user.role, "records:import");
  const limits = getUploadLimits();

  if (!canImport) {
    return (
      <div>
        <PageHeader title="New import" description="Upload a spreadsheet into a register." />
        <div className="p-4 sm:p-6 lg:p-8">
          <EmptyState
            icon={<ShieldAlert className="size-8" />}
            title="Your role cannot run imports"
            description="Ask an administrator to grant your account the records:import capability."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/imports">Back to imports</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (registerId) {
    const access = await requireRegisterAccess(registerId, "import");
    return (
      <div>
        <PageHeader
          title="New import"
          description={`Map a spreadsheet into “${access.register.name}”. Nothing is written until you review and start.`}
          breadcrumb={
            <Link href="/imports" className="hover:underline">
              Imports
            </Link>
          }
        />
        <div className="p-4 sm:p-6 lg:p-8">
          <ImportWizard
            registerTarget={{ registerId: access.register.id, registerName: access.register.name }}
            fields={access.fields.map((field) => ({
              id: field.id,
              fieldKey: field.fieldKey,
              name: field.name,
              fieldType: field.fieldType as FieldType,
              required: field.required,
            }))}
            importable={[]}
            canCreateRegister={false}
            limits={{ maxUploadBytes: limits.maxUploadBytes, maxImportRows: limits.maxImportRows }}
          />
        </div>
      </div>
    );
  }

  const importable = await listImportableRegisters(session);

  return (
    <div>
      <PageHeader
        title="New import"
        description="Choose the register your spreadsheet should go into."
        breadcrumb={
          <Link href="/imports" className="hover:underline">
            Imports
          </Link>
        }
      />
      <div className="p-4 sm:p-6 lg:p-8">
        <ImportWizard
          registerTarget={null}
          fields={[]}
          importable={importable.map((register) => ({
            id: register.id,
            name: register.name,
            description: register.description,
            recordCount: register.recordCount,
          }))}
          canCreateRegister
          limits={{ maxUploadBytes: limits.maxUploadBytes, maxImportRows: limits.maxImportRows }}
        />
      </div>
    </div>
  );
}
