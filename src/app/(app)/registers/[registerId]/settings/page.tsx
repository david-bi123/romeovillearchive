import type { Metadata } from "next";
import { requireRegisterAccess } from "@/lib/auth/guard";
import { canAssignRole } from "@/lib/auth/rbac";
import { listRegisterGrants } from "@/server/registers";
import { listUsersForAdmin } from "@/server/actions/users";
import { readSetting } from "@/server/actions/shared";
import { PageHeader, PageSection } from "@/components/app/layout-primitives";
import { RegisterTabs } from "@/components/app/register-tabs";
import { RegisterSettingsForm } from "@/components/app/register-settings-form";
import { AccessGrants } from "@/components/app/access-grants";

export const metadata: Metadata = { title: "Register settings" };

export default async function RegisterSettingsPage({
  params,
}: {
  params: Promise<{ registerId: string }>;
}) {
  const { registerId } = await params;
  const { register, permissions, session } = await requireRegisterAccess(registerId, "view");

  const isSuper = session.user.role === "super_admin";
  const isAdmin = session.user.role === "admin";
  const canManageAccess = isSuper || isAdmin;
  const canEdit = permissions.edit || isSuper;

  const [grants, users, allowAdminInvites] = await Promise.all([
    listRegisterGrants(registerId),
    canManageAccess
      ? listUsersForAdmin().catch(() => [])
      : Promise.resolve([]),
    readSetting("allow_admin_invitations"),
  ]);

  const userOptions = users
    .filter((user) => canAssignRole(session.user.role, user.role) || user.id === session.user.id)
    .map((user) => ({ id: user.id, fullName: user.fullName, email: user.email }));

  return (
    <div>
      <PageHeader
        title={`${register.name} — settings`}
        description="Register details, who can access it, and lifecycle actions."
      />
      <RegisterTabs
        registerId={registerId}
        active="settings"
        counts={{ records: register.recordCount }}
      />
      <div className="space-y-10 p-4 sm:p-6 lg:p-8">
        <PageSection title="Details" description="Shown in navigation, cards and export headers.">
          <RegisterSettingsForm
            register={register}
            canEdit={canEdit}
            canArchive={canEdit}
            canDelete={isSuper || isAdmin}
            canDuplicate={permissions.create || isSuper}
            recordCount={register.recordCount}
          />
        </PageSection>

        <PageSection
          title="Access"
          description={
            canManageAccess
              ? "Role defaults apply to everyone with that role; user overrides win. " +
                (isAdmin && allowAdminInvites !== "true" && !isSuper
                  ? "You are an administrator: role overrides are limited to roles you can assign."
                  : "")
              : "Only administrators can change register access."
          }
        >
          {canManageAccess ? (
            <AccessGrants registerId={registerId} grants={grants} users={userOptions} />
          ) : (
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                Your effective permissions:{" "}
                {(
                  [
                    ["view", permissions.view],
                    ["create", permissions.create],
                    ["edit", permissions.edit],
                    ["delete", permissions.delete],
                    ["import", permissions.import],
                    ["export", permissions.export],
                  ] as const
                )
                  .filter(([, granted]) => granted)
                  .map(([key]) => key)
                  .join(", ") || "none"}
              </li>
            </ul>
          )}
        </PageSection>
      </div>
    </div>
  );
}
