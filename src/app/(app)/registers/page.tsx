import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Plus, Search as SearchIcon } from "lucide-react";
import { requireSession } from "@/lib/auth/guard";
import { getRegistersWithCounts } from "@/server/registers";
import { PageHeader, EmptyState } from "@/components/app/layout-primitives";
import { RestoreRegisterButton } from "@/components/app/restore-register-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Registers" };

export default async function RegistersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const includeArchived = params.archived === "1";

  const registers = await getRegistersWithCounts({
    includeArchived,
    search: search || undefined,
    userId: session.user.id,
    role: session.user.role,
  });

  const canCreate = session.user.role !== "viewer";

  return (
    <div>
      <PageHeader
        title="Registers"
        description="Every structured register you are allowed to open."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/registers/new">
                <Plus className="size-4" />
                New register
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <form className="flex flex-wrap items-center gap-2" action="/registers" method="get">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={search}
              placeholder="Search registers…"
              className="pl-8"
              aria-label="Search registers"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="archived"
              value="1"
              defaultChecked={includeArchived}
              className="size-4 accent-[var(--primary)]"
            />
            Show archived
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Apply
          </Button>
        </form>

        {registers.length === 0 ? (
          <EmptyState
            icon={<Boxes className="size-8" />}
            title={search ? "No registers match your search" : "No registers yet"}
            description={
              search
                ? "Try a different term, or clear the search to see everything."
                : "A register is a typed table of records with its own columns, permissions and import settings."
            }
            action={
              canCreate && !search ? (
                <Button asChild size="sm">
                  <Link href="/registers/new">
                    <Plus className="size-4" />
                    Create a register
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {registers.map((register) => {
              const archived = register.status === "archived";
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{register.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {register.description || "No description"}
                      </p>
                    </div>
                    {archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : register.color ? (
                      <span
                        className="mt-1 size-3 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: register.color }}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {register.recordCount.toLocaleString("en-GB")} record
                      {register.recordCount === 1 ? "" : "s"} · {register.fieldCount} column
                      {register.fieldCount === 1 ? "" : "s"}
                    </span>
                    <span>{relativeTime(register.updatedAt)}</span>
                  </div>
                  {register.category ? (
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {register.category} · created {formatDate(register.createdAt)}
                    </span>
                  ) : null}
                </>
              );
              return (
                <li key={register.id}>
                  {archived ? (
                    <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 opacity-80">
                      {body}
                      <RestoreRegisterButton registerId={register.id} registerName={register.name} />
                    </div>
                  ) : (
                    <Link
                      href={`/registers/${register.id}`}
                      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
