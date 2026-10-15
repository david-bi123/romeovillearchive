import Link from "next/link";
import { FileText, Table2 } from "lucide-react";
import { PageSection } from "@/components/app/layout-primitives";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { GlobalSearchResult } from "@/server/search";

export function SearchResults({ result }: { result: GlobalSearchResult }) {
  const registerCapped = result.registers.total > result.registers.items.length;
  const recordCapped = result.records.total > result.records.items.length;

  return (
    <>
      <PageSection
        title="Registers"
        description={
          registerCapped
            ? `Showing the ${result.registers.items.length} most recently updated of ${result.registers.total} matches.`
            : `${result.registers.total} matching register${result.registers.total === 1 ? "" : "s"}.`
        }
      >
        {result.registers.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No registers matched.</p>
        ) : (
          <ul className="divide-y divide-border">
            {result.registers.items.map((register) => (
              <li key={register.id}>
                <Link
                  href={`/registers/${register.id}`}
                  className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/40"
                >
                  <Table2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{register.name}</p>
                      {register.category ? (
                        <Badge variant="outline">{register.category}</Badge>
                      ) : null}
                    </div>
                    {register.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {register.description}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {register.recordCount} record
                      {register.recordCount === 1 ? "" : "s"} · updated{" "}
                      {formatDate(register.updatedAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection
        title="Records"
        description={
          recordCapped
            ? `Showing the ${result.records.items.length} most recently updated of ${result.records.total} matches.`
            : `${result.records.total} matching record${result.records.total === 1 ? "" : "s"}.`
        }
      >
        {result.records.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No records matched.</p>
        ) : (
          <ul className="divide-y divide-border">
            {result.records.items.map((record) => (
              <li key={record.id}>
                <Link
                  href={`/registers/${record.registerId}/records/${record.id}`}
                  className="flex items-start gap-3 py-3 transition-colors hover:bg-muted/40"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {record.registerName} · Record #{record.serial}
                      </p>
                      <Badge variant="secondary">Record</Badge>
                    </div>
                    {record.context.length > 0 ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {record.context.map((entry) => `${entry.label}: ${entry.value}`).join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Updated {formatDate(record.updatedAt, true)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </>
  );
}
