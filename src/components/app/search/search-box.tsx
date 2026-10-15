import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchBox({ query }: { query: string }) {
  return (
    <form method="get" action="/search" className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1 space-y-1.5">
        <label htmlFor="q" className="text-xs font-medium text-muted-foreground">
          Search registers and records
        </label>
        <Input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="Invoice, supplier name, a serial number…"
          maxLength={120}
          autoFocus
        />
      </div>
      <Button type="submit">
        <Search className="size-4" />
        Search
      </Button>
    </form>
  );
}
