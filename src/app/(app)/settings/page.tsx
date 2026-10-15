import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { PageHeader, PageSection } from "@/components/app/layout-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { roleHasCapability } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/guard";
import { readSetting } from "@/server/actions/shared";
import { ChangePasswordForm } from "@/components/app/settings/change-password-form";
import { SecuritySettingsForm } from "@/components/app/settings/security-settings-form";
import { AboutSection } from "@/components/app/settings/about-section";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const canManage = roleHasCapability(session.user.role, "settings:manage");
  const allowAdminInvitations = (await readSetting("allow_admin_invitations")) === "true";

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Settings"
        description="Your account security and the instance-wide policies that apply to everyone."
      />

      <div id="change-password" className="scroll-mt-20">
        <PageSection
          title="Change password"
          description="Updating your password signs out every other device immediately."
        >
          <ChangePasswordForm />
        </PageSection>
      </div>

      <PageSection
        title="Security"
        description="Policies controlled by the super administrator."
      >
        {canManage ? (
          <SecuritySettingsForm allowAdminInvitations={allowAdminInvitations} />
        ) : (
          <Alert>
            <Lock className="size-4" />
            <AlertTitle>Read only</AlertTitle>
            <AlertDescription>
              Only the super administrator can change security settings.
              Currently administrators may send invitations:{" "}
              <strong>{allowAdminInvitations ? "enabled" : "disabled"}</strong>.
            </AlertDescription>
          </Alert>
        )}
      </PageSection>

      <PageSection
        title="About"
        description="Limits and delivery state of this instance. No secrets are shown here."
      >
        <AboutSection />
      </PageSection>
    </div>
  );
}
