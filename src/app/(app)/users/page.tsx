import type { Metadata } from "next";
import { AlertTriangle, Inbox } from "lucide-react";
import { PageHeader, PageSection } from "@/components/app/layout-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { roleHasCapability, ROLE_LABELS } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";
import { readSetting } from "@/server/actions/shared";
import {
  hasActiveSuperAdmin,
  listInvitationsForAdmin,
  listUsersForAdmin,
} from "@/server/actions/users";
import { TeamTable } from "@/components/app/users/team-table";
import { InvitationsTable } from "@/components/app/users/invitations-table";
import { InviteDialog } from "@/components/app/users/invite-dialog";

export const metadata: Metadata = { title: "Team & access" };

export default async function UsersPage() {
  await requireSession();
  const session = await requireCapability("users:read");

  const [users, invitations, superAdminActive] = await Promise.all([
    listUsersForAdmin(),
    listInvitationsForAdmin(),
    hasActiveSuperAdmin(),
  ]);

  const actor = { id: session.user.id, role: session.user.role as Role };
  const canManage = actor.role === "super_admin";
  const canInvite =
    roleHasCapability(actor.role, "users:invite") &&
    (actor.role === "super_admin" || (await readSetting("allow_admin_invitations")) === "true");
  const inviteHint =
    actor.role === "admin" && !canInvite
      ? " The super administrator has disabled administrator invitations in Security settings."
      : "";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Team & access"
        description="Who can sign in to Romeoville Archive and what they are allowed to do."
      />

      {!superAdminActive ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>No active super administrator</AlertTitle>
          <AlertDescription>
            Every super administrator account is deactivated or removed. Until
            one is reactivated nobody can manage security settings. Ask an
            operator to restore a super administrator from the database.
          </AlertDescription>
        </Alert>
      ) : null}

      <PageSection
        title="Team"
        description={
          canManage
            ? "Change a member’s role or revoke their sessions instantly."
            : `You are signed in as ${ROLE_LABELS[actor.role]}.${inviteHint}`
        }
        actions={canInvite ? <InviteDialog actorRole={actor.role} /> : undefined}
      >
        {users.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No accounts exist yet.</p>
          </div>
        ) : (
          <TeamTable users={users} actor={actor} canManage={canManage} />
        )}
      </PageSection>

      <PageSection
        title="Pending invitations"
        description="Invitations expire 72 hours after they are sent. A revoked or expired link can be resent."
      >
        <InvitationsTable invitations={invitations} canManage={canManage} />
      </PageSection>
    </div>
  );
}
