import type { Metadata } from "next";
import { requireRegisterAccess } from "@/lib/auth/guard";
import { PageHeader, PageSection } from "@/components/app/layout-primitives";
import { RegisterTabs } from "@/components/app/register-tabs";
import { FieldManager } from "@/components/app/field-manager";

export const metadata: Metadata = { title: "Columns" };

export default async function RegisterFieldsPage({
  params,
}: {
  params: Promise<{ registerId: string }>;
}) {
  const { registerId } = await params;
  const { register, fields, permissions, session } = await requireRegisterAccess(registerId, "view");
  const canEdit = permissions.edit || session.user.role === "super_admin";

  return (
    <div>
      <PageHeader
        title={`${register.name} — columns`}
        description="The schema every record and import in this register follows."
      />
      <RegisterTabs
        registerId={registerId}
        active="fields"
        counts={{ records: register.recordCount, fields: fields.length }}
      />
      <div className="max-w-4xl p-4 sm:p-6 lg:p-8">
        <PageSection
          title="Columns"
          description={
            canEdit
              ? "Reordering changes the table layout and export column order."
              : "You can view the schema but not change it."
          }
        >
          <FieldManager registerId={registerId} fields={fields} canEdit={canEdit} />
        </PageSection>
      </div>
    </div>
  );
}
