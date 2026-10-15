import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageHeader, PageSection } from "@/components/app/layout-primitives";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { formatDate, relativeTime, titleCase } from "@/lib/utils";
import { listActivity, listActivityActions } from "@/server/activity";
import { ActionBadge } from "@/components/app/activity/action-badge";
import { MetadataButton } from "@/components/app/activity/metadata-button";
import {
  FilterBar,
  type ActivityFilters,
} from "@/components/app/activity/filter-bar";
import { Pagination } from "@/components/app/activity/pagination";

export const metadata: Metadata = { title: "Activity log" };

function parseDay(raw: string | undefined, endOfDay: boolean): Date | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = endOfDay
    ? new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999)
    : new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  await requireCapability("activity:read");

  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value.trim() : "";
  };

  const filters: ActivityFilters = {
    action: single("action"),
    entity: single("entity"),
    from: single("from"),
    to: single("to"),
    q: single("q").slice(0, 200),
  };

  let from = parseDay(filters.from, false);
  let to = parseDay(filters.to, true);
  let dateWarning: string | null = null;
  if (filters.from && !from) dateWarning = "The from date was not a valid date and was ignored.";
  if (filters.to && !to) dateWarning = "The to date was not a valid date and was ignored.";
  if (from && to && from.getTime() > to.getTime()) {
    [from, to] = [to, from];
    dateWarning = "The date range was swapped because the start was after the end.";
  }

  const rawPage = Number.parseInt(single("page"), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const [data, actions] = await Promise.all([
    listActivity({
      action: filters.action || null,
      entityType: filters.entity || null,
      from,
      to,
      search: filters.q || null,
      page,
    }),
    listActivityActions(),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Activity log"
        description="Every security and data event, newest first. Metadata stays hidden until you open it."
      />

      <PageSection>
        <FilterBar filters={filters} actions={actions} dateWarning={dateWarning} />
      </PageSection>

      <PageSection
        title="Events"
        description={`${data.total} matching event${data.total === 1 ? "" : "s"}.`}
      >
        {data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No activity matches these filters.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-20">IP</TableHead>
                    <TableHead className="w-14 text-right">Meta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span
                          className="text-sm text-muted-foreground"
                          title={formatDate(item.createdAt, true)}
                        >
                          {relativeTime(item.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <p className="truncate text-sm font-medium">
                          {item.actorName ?? "—"}
                        </p>
                        {item.actorEmail ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.actorEmail}
                          </p>
                        ) : item.actorName ? null : (
                          <p className="text-xs text-muted-foreground">System</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={item.action} />
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{titleCase(item.entityType)}</p>
                        {item.entityId ? (
                          <p className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                            {item.entityId}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-72">
                        <p className="truncate text-sm text-muted-foreground">
                          {item.summary ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        {item.ip ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.ip}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.metadata != null ? (
                          <MetadataButton metadata={item.metadata} action={item.action} />
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            —
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              filters={filters}
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
            />
          </>
        )}
      </PageSection>
    </div>
  );
}
