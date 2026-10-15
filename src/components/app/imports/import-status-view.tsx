"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/app/layout-primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ImportStatusBadge,
  importProgressPercent,
  isImportCancellable,
  isImportDiscardable,
} from "@/components/app/imports/import-status-badge";
import { cancelImportAction, discardImportAction } from "@/server/actions/imports";
import type { ImportJobSummary, ImportErrorItem } from "@/server/imports";
import { guardSpreadsheetCell } from "@/lib/excel/export";
import { formatDate, formatNumber, relativeTime } from "@/lib/utils";

const ERROR_PAGE_SIZE = 25;

type Props = {
  summary: ImportJobSummary;
  register: { id: string; name: string } | null;
  errors: ImportErrorItem[];
};

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function ImportStatusView({ summary, register, errors }: Props) {
  const router = useRouter();
  const active = summary.status === "pending" || summary.status === "processing";
  const [busy, setBusy] = useState(false);
  const [errorPage, setErrorPage] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [active, router]);

  const percent = importProgressPercent(summary.status, summary.progress, summary.rowsTotal);
  const totalPages = Math.max(1, Math.ceil(errors.length / ERROR_PAGE_SIZE));
  const safePage = Math.min(errorPage, totalPages - 1);
  const pageItems = errors.slice(safePage * ERROR_PAGE_SIZE, (safePage + 1) * ERROR_PAGE_SIZE);

  const runAction = async (fn: (id: string) => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    try {
      const result = await fn(summary.id);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
      } else {
        toast.error(result.message ?? "The request failed.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  const copyCsv = () => {
    const header = ["row", "column", "code", "severity", "message"];
    const lines = [
      header.map(csvEscape).join(","),
      ...errors.map((item) =>
        [
          guardSpreadsheetCell(item.rowNumber),
          guardSpreadsheetCell(item.columnName ?? ""),
          guardSpreadsheetCell(item.code),
          guardSpreadsheetCell(item.severity),
          guardSpreadsheetCell(item.message),
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `import-errors-${summary.id.slice(0, 8)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {summary.status === "completed" ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertTitle>Import completed</AlertTitle>
          <AlertDescription>
            {formatNumber(summary.rowsImported)} record
            {summary.rowsImported === 1 ? "" : "s"} added
            {register ? (
              <>
                {" "}
                to{" "}
                <Link href={`/registers/${register.id}`} className="font-medium underline">
                  {register.name}
                </Link>
              </>
            ) : null}
            .
          </AlertDescription>
        </Alert>
      ) : summary.status === "partial" ? (
        <Alert variant="warning">
          <AlertTriangle className="size-4" />
          <AlertTitle>Import finished with rejected rows</AlertTitle>
          <AlertDescription>
            {formatNumber(summary.rowsImported)} record
            {summary.rowsImported === 1 ? "" : "s"} were imported and{" "}
            {formatNumber(summary.rowsRejected)} row
            {summary.rowsRejected === 1 ? "" : "s"} failed validation — the failures are listed
            below.
          </AlertDescription>
        </Alert>
      ) : summary.status === "failed" || summary.status === "cancelled" ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {summary.status === "failed" ? "Import failed" : "Import cancelled"}
          </AlertTitle>
          <AlertDescription>
            {summary.errorMessage ??
              (summary.status === "cancelled"
                ? "This import was cancelled before it finished."
                : "The import stopped before it finished.")}
            {" "}
            {formatNumber(summary.rowsImported)} record
            {summary.rowsImported === 1 ? "" : "s"} had already been written when it stopped.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="info">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {summary.status === "draft" ? "Draft — not started yet" : "Import in progress"}
          </AlertTitle>
          <AlertDescription>
            {summary.status === "draft"
              ? "This job has not been started. Open the wizard to finish the mapping, or cancel the draft."
              : summary.status === "pending"
                ? "The import is queued and will start shortly."
                : `Processing — ${percent}% of the rows are done. This page refreshes automatically.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Created"
          value={formatNumber(summary.rowsImported)}
          tone={summary.rowsImported > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Updated"
          value={formatNumber(summary.rowsUpdated)}
          tone={summary.rowsUpdated > 0 ? "info" : "neutral"}
        />
        <StatCard
          label="Skipped"
          value={formatNumber(summary.rowsSkipped)}
        />
        <StatCard
          label="Failed"
          value={formatNumber(summary.rowsRejected)}
          tone={summary.rowsRejected > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Duplicates found"
          value={formatNumber(summary.duplicatesFound)}
        />
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ImportStatusBadge status={summary.status} />
              <span className="truncate text-sm font-medium">{summary.filename}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {register ? (
                <Link href={`/registers/${register.id}`} className="underline">
                  {register.name}
                </Link>
              ) : (
                "Register unavailable"
              )}
              {summary.finishedAt ? (
                <> · finished {formatDate(summary.finishedAt, true)} ({relativeTime(summary.finishedAt)})</>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isImportCancellable(summary.status) ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy}>
                    <XCircle className="size-4" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this import?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {summary.status === "draft"
                        ? "The draft and its uploaded file are discarded."
                        : "Cancellation is requested — the import stops after the batch it is currently processing."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep import</AlertDialogCancel>
                    <AlertDialogAction disabled={busy} onClick={() => void runAction(cancelImportAction)}>
                      Cancel import
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {isImportDiscardable(summary.status) ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy}>
                    <Trash2 className="size-4" />
                    Discard
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Discard this import?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The uploaded file is deleted and the job is marked cancelled. Records that
                      were already imported are not removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep job</AlertDialogCancel>
                    <AlertDialogAction disabled={busy} onClick={() => void runAction(discardImportAction)}>
                      Discard job
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3">
            <Progress value={percent} className="h-2 flex-1" aria-label={`${percent}%`} />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {percent}%
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(Math.min(summary.progress, summary.rowsTotal || summary.progress))} of{" "}
            {summary.rowsTotal > 0 ? formatNumber(summary.rowsTotal) : "?"} rows processed
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold">Row errors</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Validation failures reported by the importer, in worksheet row order.
            </p>
          </div>
          {errors.length > 0 ? (
            <Button size="sm" variant="outline" onClick={copyCsv}>
              <Download className="size-4" />
              Copy as CSV
            </Button>
          ) : null}
        </div>

        {errors.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
            {summary.rowsRejected > 0 && active
              ? "Errors will appear here once validation runs."
              : "No row errors recorded for this import."}
          </p>
        ) : (
          <div className="p-4 sm:p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 text-right">Row</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-24">Severity</TableHead>
                  <TableHead className="w-28">Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-right tabular-nums">{item.rowNumber}</TableCell>
                    <TableCell>{item.columnName ?? "—"}</TableCell>
                    <TableCell className="min-w-[240px]">{item.message}</TableCell>
                    <TableCell>
                      <Badge variant={item.severity === "error" ? "destructive" : "warning"}>
                        {item.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.code}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Showing {formatNumber(safePage * ERROR_PAGE_SIZE + 1)}–
                {formatNumber(Math.min(errors.length, (safePage + 1) * ERROR_PAGE_SIZE))} of{" "}
                {formatNumber(errors.length)}
                {errors.length >= 1000 ? " (capped at 1,000)" : ""}
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage === 0}
                    onClick={() => setErrorPage(safePage - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {safePage + 1} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setErrorPage(safePage + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
