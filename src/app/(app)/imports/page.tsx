import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Inbox } from "lucide-react";
import { requireSession } from "@/lib/auth/guard";
import { roleHasCapability } from "@/lib/auth/rbac";
import { listImportJobsForUser } from "@/server/imports-list";
import { PageHeader, EmptyState } from "@/components/app/layout-primitives";
import { Button } from "@/components/ui/button";
import { ImportsTable } from "@/components/app/imports/imports-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Imports" };

const PAGE_SIZE = 20;

function pageHref(page: number): string {
  return page <= 1 ? "/imports" : `/imports?page=${page}`;
}

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const canImport = roleHasCapability(session.user.role, "records:import");
  const { items, total, page: currentPage, pageSize } = canImport
    ? await listImportJobsForUser(session, { page, pageSize: PAGE_SIZE })
    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div>
      <PageHeader
        title="Imports"
        description="Spreadsheet imports into your registers, with live progress and per-row errors."
        actions={
          canImport ? (
            <Button asChild size="sm">
              <Link href="/imports/new">
                <FileUp className="size-4" />
                Start an import
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        {!canImport ? (
          <Alert variant="warning">
            <Inbox className="size-4" />
            <AlertTitle>Your role cannot run imports</AlertTitle>
            <AlertDescription>
              Ask an administrator for the <span className="font-medium">records:import</span>{" "}
              capability to unlock this page.
            </AlertDescription>
          </Alert>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileUp className="size-8" />}
            title="No imports yet"
            description="Upload an Excel file, map its columns to a register and review everything before a single row is written."
            action={
              <Button asChild size="sm">
                <Link href="/imports/new">
                  <FileUp className="size-4" />
                  Start an import
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="rounded-lg border border-border bg-surface">
              <ImportsTable jobs={items} />
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  Page {currentPage} of {totalPages} · {total.toLocaleString("en-GB")} job
                  {total === 1 ? "" : "s"}
                </span>
                <div className="flex gap-2">
                  {hasPrev ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={pageHref(currentPage - 1)}>Previous</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      Previous
                    </Button>
                  )}
                  {hasNext ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={pageHref(currentPage + 1)}>Next</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
