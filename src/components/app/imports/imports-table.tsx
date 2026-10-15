"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Eye, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  isImportActive,
  isImportCancellable,
  isImportDiscardable,
} from "@/components/app/imports/import-status-badge";
import type { ImportJobListItem } from "@/server/imports-list";
import { cancelImportAction, discardImportAction } from "@/server/actions/imports";
import { formatNumber, relativeTime } from "@/lib/utils";

export function ImportsTable({ jobs }: { jobs: ImportJobListItem[] }) {
  const router = useRouter();
  const hasActive = jobs.some((job) => isImportActive(job.status));
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [hasActive, router]);

  const runAction = (jobId: string, fn: (id: string) => Promise<{ ok: boolean; message?: string }>) => {
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        const result = await fn(jobId);
        if (result.ok) {
          toast.success(result.message ?? "Done.");
        } else {
          toast.error(result.message ?? "The request failed.");
        }
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setPendingJobId(null);
        router.refresh();
      }
    });
  };

  if (jobs.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Register</TableHead>
          <TableHead>File</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Created</TableHead>
          <TableHead className="text-right">Updated</TableHead>
          <TableHead className="text-right">Skipped</TableHead>
          <TableHead className="text-right">Failed</TableHead>
          <TableHead className="min-w-[140px]">Progress</TableHead>
          <TableHead>Started</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => {
          const percent = importProgressPercent(job.status, job.progress, job.rowsTotal);
          const busy = pendingJobId === job.id;
          return (
            <TableRow key={job.id}>
              <TableCell className="max-w-[180px]">
                {job.targetRegisterId ? (
                  <Link
                    href={`/registers/${job.targetRegisterId}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {job.registerName ?? "Register"}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">
                    {job.registerName ?? "New register"}
                  </span>
                )}
              </TableCell>
              <TableCell className="max-w-[220px]">
                <span className="block truncate text-muted-foreground">{job.filename}</span>
              </TableCell>
              <TableCell>
                <ImportStatusBadge status={job.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(job.rowsImported)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(job.rowsUpdated)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(job.rowsSkipped)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {job.rowsRejected > 0 ? (
                  <Badge variant="warning" className="tabular-nums">
                    {formatNumber(job.rowsRejected)}
                  </Badge>
                ) : (
                  <span className="tabular-nums text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={percent} className="h-1.5 w-24" aria-label={`${percent}%`} />
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {percent}%
                  </span>
                </div>
                {job.rowsTotal > 0 ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {formatNumber(Math.min(job.progress, job.rowsTotal))} / {formatNumber(job.rowsTotal)} rows
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {relativeTime(job.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button asChild size="sm" variant="ghost" title="Open job">
                    <Link href={`/imports/${job.id}`}>
                      <Eye className="size-4" />
                      Open
                    </Link>
                  </Button>
                  {isImportCancellable(job.status) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" disabled={busy} title="Cancel import">
                          <XCircle className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this import?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {job.status === "draft"
                              ? "This draft and its uploaded file will be discarded."
                              : "Cancellation is requested — the import stops after the batch it is currently processing."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep import</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => runAction(job.id, cancelImportAction)}
                          >
                            Cancel import
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                  {isImportDiscardable(job.status) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" disabled={busy} title="Discard job">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Discard this import?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The uploaded file is deleted and the job is marked cancelled. Records
                            already imported are not removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep job</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => runAction(job.id, discardImportAction)}
                          >
                            Discard job
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
