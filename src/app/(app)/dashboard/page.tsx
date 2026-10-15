import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileUp, LayoutList, Plus, Search, Users } from "lucide-react";
import { requireSession } from "@/lib/auth/guard";
import { roleHasCapability } from "@/lib/auth/rbac";
import { loadDashboard } from "@/server/dashboard";
import { PageHeader, PageSection, StatCard } from "@/components/app/layout-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireSession();
  const data = await loadDashboard(session.user.role, session.user.id);
  const firstName = session.user.fullName?.split(" ")[0] ?? session.user.email;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Registers, imports and activity across the workspace."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/registers/new">
              <LayoutList className="size-4" />
              New register
            </Link>
          </Button>
        }
      />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <PageSection title="Quick actions" description="Jump straight into today's work.">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {roleHasCapability(session.user.role, "registers:create") ? (
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link href="/registers/new">
                  <Plus className="size-4 text-primary" />
                  New register
                </Link>
              </Button>
            ) : null}
            {roleHasCapability(session.user.role, "records:import") ? (
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link href="/imports/new">
                  <FileUp className="size-4 text-primary" />
                  Import Excel file
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="justify-start gap-2">
              <Link href="/registers">
                <LayoutList className="size-4 text-primary" />
                Browse registers
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2">
              <Link href="/search">
                <Search className="size-4 text-primary" />
                Search records
              </Link>
            </Button>
            {data.canSeeUsers ? (
              <Button asChild variant="outline" className="justify-start gap-2">
                <Link href="/users">
                  <Users className="size-4 text-primary" />
                  Manage team
                </Link>
              </Button>
            ) : null}
          </div>
        </PageSection>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Registers"
            value={data.registerCount}
            hint="Active registers you can open"
            icon={<LayoutList className="size-4" />}
          />
          <StatCard
            label="Records"
            value={data.recordCount.toLocaleString("en-GB")}
            hint="Across every register"
            icon={<ArrowRight className="size-4" />}
          />
          <StatCard
            label="Staff accounts"
            value={data.canSeeUsers ? data.activeUsers : "—"}
            hint={
              data.canSeeUsers
                ? `${data.pendingInvitations} pending invitation${data.pendingInvitations === 1 ? "" : "s"}`
                : "Hidden for your role"
            }
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Imports in flight"
            value={data.runningImports}
            hint={data.runningImports > 0 ? "Open Imports to watch progress" : "Nothing running"}
            tone={data.runningImports > 0 ? "warning" : "neutral"}
            icon={<FileUp className="size-4" />}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <PageSection
            title="Registers by size"
            description="The registers holding the most records."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/registers">
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          >
            {data.topRegisters.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No registers yet.{" "}
                <Link href="/registers/new" className="underline">
                  Create the first one
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.topRegisters.map((register) => (
                  <li key={register.id}>
                    <Link
                      href={`/registers/${register.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 hover:bg-muted/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{register.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {register.fieldCount} column{register.fieldCount === 1 ? "" : "s"} ·
                          updated {relativeTime(register.updatedAt)}
                        </span>
                      </span>
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {register.recordCount.toLocaleString("en-GB")}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PageSection>

          <PageSection
            title="Recent activity"
            description="Latest audited actions across the system."
            actions={
              data.canSeeActivity ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/activity">
                    Open activity
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null
            }
          >
            {data.recent.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recent.items.map((entry) => (
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
