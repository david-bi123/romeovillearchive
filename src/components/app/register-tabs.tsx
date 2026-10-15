import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "records", label: "Records" },
  { key: "fields", label: "Columns" },
  { key: "settings", label: "Settings & access" },
] as const;

export type RegisterTabKey = (typeof TABS)[number]["key"];

export function RegisterTabs({
  registerId,
  active,
  counts,
}: {
  registerId: string;
  active: RegisterTabKey;
  counts?: { records?: number; fields?: number };
}) {
  return (
    <nav
      aria-label="Register sections"
      className="scrollbar-none flex gap-1 overflow-x-auto border-b border-border bg-surface px-4 sm:px-6 lg:px-8"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const suffix =
          tab.key === "records" && typeof counts?.records === "number"
            ? ` (${counts.records.toLocaleString("en-GB")})`
            : tab.key === "fields" && typeof counts?.fields === "number"
              ? ` (${counts.fields})`
              : "";
        return (
          <Link
            key={tab.key}
            href={`/registers/${registerId}${tab.key === "records" ? "" : `/${tab.key}`}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {suffix}
          </Link>
        );
      })}
    </nav>
  );
}
