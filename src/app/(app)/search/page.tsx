import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/app/layout-primitives";
import { requireSession } from "@/lib/auth/guard";
import { globalSearch } from "@/server/search";
import { SearchBox } from "@/components/app/search/search-box";
import { SearchResults } from "@/components/app/search/search-results";

export const metadata: Metadata = { title: "Search" };

const EXAMPLE_QUERIES = ["Indenture", "Plot", "2024"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const raw = params.q;
  const q = typeof raw === "string" ? raw : "";

  const result = await globalSearch(q, session);
  const hasQuery = result.query.length > 0;
  const hasResults = result.registers.total > 0 || result.records.total > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Search"
        description="One query across every register and record you are allowed to open."
      />

      <SearchBox query={q} />

      {!hasQuery ? (
        <EmptyState
          icon={<SearchX className="size-8" />}
          title="Start typing to search"
          description="Results update on submit. Only registers you can view appear, along with their active records."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {EXAMPLE_QUERIES.map((example) => (
                <Link
                  key={example}
                  href={`/search?q=${encodeURIComponent(example)}`}
                  className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Try “{example}”
                </Link>
              ))}
            </div>
          }
        />
      ) : !hasResults ? (
        <EmptyState
          icon={<SearchX className="size-8" />}
          title={`Nothing matched “${result.query}”`}
          description="Check the spelling, try a shorter keyword, or confirm the record lives in a register you have access to."
        />
      ) : (
        <SearchResults result={result} />
      )}
    </div>
  );
}
