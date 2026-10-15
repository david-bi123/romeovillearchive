import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

export const ACTIVE_IMPORT_STATUSES = ["draft", "pending", "processing"] as const;
export const CANCELLABLE_IMPORT_STATUSES = ["draft", "pending", "processing"] as const;
export const DISCARDABLE_IMPORT_STATUSES = ["draft", "completed", "failed", "cancelled"] as const;

export function isImportActive(status: string): boolean {
  return (ACTIVE_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function isImportCancellable(status: string): boolean {
  return (CANCELLABLE_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function isImportDiscardable(status: string): boolean {
  return (DISCARDABLE_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function importStatusVariant(
  status: string,
): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info" {
  switch (status) {
    case "draft":
      return "outline";
    case "pending":
      return "info";
    case "processing":
      return "info";
    case "completed":
      return "success";
    case "partial":
      return "warning";
    case "failed":
      return "destructive";
    case "cancelled":
      return "secondary";
    default:
      return "secondary";
  }
}

export function ImportStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={importStatusVariant(status)} className={cn("capitalize", className)}>
      {status === "processing" ? <Spinner className="size-3" /> : null}
      {status}
    </Badge>
  );
}

export function importProgressPercent(status: string, progress: number, rowsTotal: number): number {
  if (status === "completed") return 100;
  if (rowsTotal > 0) return Math.min(100, Math.max(0, Math.round((progress / rowsTotal) * 100)));
  return 0;
}
