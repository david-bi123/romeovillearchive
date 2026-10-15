"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Field } from "@/components/app/form-primitives";
import type { SheetSummary } from "@/lib/excel/workbook";
import type { ColumnProfile, MappingEntry } from "@/lib/excel/infer";
import { cn, formatBytes, formatNumber } from "@/lib/utils";

const CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_CHUNK_ATTEMPTS = 3;
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm"];

export type AnalyzeProfile = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  profiles: ColumnProfile[];
  preview: unknown[][];
  previewRowNumbers: number[];
  totalRows: number;
  warnings: string[];
  truncated: boolean;
};

export type AnalyzeResult = {
  sheets: SheetSummary[];
  profile: AnalyzeProfile | null;
  suggestedMapping: MappingEntry[];
};

export type UploadTarget =
  | { kind: "existing_register"; registerId: string; registerName: string }
  | { kind: "new_register"; registerName: string };

type Props = {
  target: UploadTarget;
  limits: { maxUploadBytes: number; maxImportRows: number };
  jobId: string | null;
  analysis: AnalyzeResult | null;
  sheetName: string | null;
  headerRow: number;
  onJobReady: (jobId: string) => void;
  onAnalysis: (result: AnalyzeResult) => void;
  onContinue: (input: { sheetName: string; headerRow: number }) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* body was not JSON */
  }
  return `The server responded with ${response.status}.`;
}

export function ImportUploadStep({
  target,
  limits,
  jobId,
  analysis,
  sheetName,
  headerRow,
  onJobReady,
  onAnalysis,
  onContinue,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "creating" | "uploading" | "analyzing">("idle");
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedFrom, setFailedFrom] = useState<number | null>(null);
  const [localSheet, setLocalSheet] = useState<string | null>(sheetName);
  const [localHeaderRow, setLocalHeaderRow] = useState(headerRow);
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);

  const activeJobId = jobId;
  const percent =
    file && file.size > 0 ? Math.min(100, Math.round((loadedBytes / file.size) * 100)) : 0;

  const validateFile = (candidate: File): string | null => {
    const lower = candidate.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
      return "Only .xlsx, .xls and .xlsm workbooks can be imported.";
    }
    if (candidate.size === 0) return "That file is empty.";
    if (candidate.size > limits.maxUploadBytes) {
      return `The file is ${formatBytes(candidate.size)} — the limit is ${formatBytes(limits.maxUploadBytes)}.`;
    }
    return null;
  };

  const uploadChunks = async (id: string, selected: File, fromIndex: number) => {
    const count = Math.max(1, Math.ceil(selected.size / CHUNK_BYTES));
    setChunkCount(count);
    for (let index = fromIndex; index < count; index++) {
      const start = index * CHUNK_BYTES;
      const end = Math.min(selected.size, start + CHUNK_BYTES);
      const blob = selected.slice(start, end);
      let lastError: string | null = null;
      let succeeded = false;

      for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
        try {
          const response = await fetch(`/api/imports/${id}/chunks`, {
            method: "POST",
            headers: { "x-chunk-index": String(index) },
            body: blob,
          });
          if (response.ok) {
            succeeded = true;
            lastError = null;
            break;
          }
          lastError = await readApiError(response);
          if (response.status >= 400 && response.status < 500) break;
        } catch {
          lastError = "The network request failed.";
        }
        if (attempt < MAX_CHUNK_ATTEMPTS) await sleep(700 * attempt);
      }

      if (!succeeded) {
        setFailedFrom(index);
        setUploadError(lastError ?? `Chunk ${index + 1} of ${count} could not be uploaded.`);
        throw new Error(lastError ?? "chunk upload failed");
      }

      setCurrentChunk(index + 1);
      setLoadedBytes(end);
    }
  };

  const startUpload = async (selected: File, fromIndex = 0) => {
    setBusy(true);
    setUploadError(null);
    try {
      let id = activeJobId;
      if (!id) {
        setPhase("creating");
        const count = Math.max(1, Math.ceil(selected.size / CHUNK_BYTES));
        const body =
          target.kind === "existing_register"
            ? {
                registerId: target.registerId,
                filename: selected.name,
                mimeType: selected.type || undefined,
                fileSize: selected.size,
                chunkCount: count,
                chunkSize: CHUNK_BYTES,
              }
            : {
                registerName: target.registerName,
                filename: selected.name,
                mimeType: selected.type || undefined,
                fileSize: selected.size,
                chunkCount: count,
                chunkSize: CHUNK_BYTES,
              };
        const response = await fetch("/api/imports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(await readApiError(response));
        const created = (await response.json()) as { jobId: string };
        id = created.jobId;
        onJobReady(id);
        setChunkCount(count);
        setFailedFrom(null);
      }

      setPhase("uploading");
      await uploadChunks(id, selected, fromIndex);

      setPhase("analyzing");
      const analyzeResponse = await fetch(`/api/imports/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!analyzeResponse.ok) throw new Error(await readApiError(analyzeResponse));
      const result = (await analyzeResponse.json()) as AnalyzeResult;
      onAnalysis(result);
      setLocalSheet(result.profile?.sheetName ?? null);
      setLocalHeaderRow(result.profile?.headerRow ?? 1);
      setFailedFrom(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The upload failed.";
      setUploadError((previous) => previous ?? message);
      toast.error(message);
    } finally {
      setBusy(false);
      setPhase("idle");
    }
  };

  const onFilePicked = (picked: File | null | undefined) => {
    if (!picked) return;
    const problem = validateFile(picked);
    if (problem) {
      toast.error(problem);
      return;
    }
    setFile(picked);
    setLoadedBytes(0);
    setCurrentChunk(0);
    setUploadError(null);
    setFailedFrom(null);
    void startUpload(picked, 0);
  };

  const reanalyze = async (nextSheet: string, nextHeaderRow: number) => {
    if (!activeJobId) return;
    setReanalyzeBusy(true);
    try {
      const response = await fetch(`/api/imports/${activeJobId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetName: nextSheet, headerRow: nextHeaderRow }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result = (await response.json()) as AnalyzeResult;
      onAnalysis(result);
      setLocalSheet(result.profile?.sheetName ?? nextSheet);
      setLocalHeaderRow(result.profile?.headerRow ?? nextHeaderRow);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not re-read the workbook.");
    } finally {
      setReanalyzeBusy(false);
    }
  };

  const profile = analysis?.profile ?? null;
  const ambiguousColumns = (profile?.profiles ?? [])
    .filter((column) => column.ambiguousDates)
    .map((column) => column.header);
  const uploaded = Boolean(activeJobId) && !uploadError && Boolean(analysis);

  return (
    <div className="space-y-5">
      {activeJobId && file ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
              {chunkCount > 0 ? ` · ${chunkCount} chunk${chunkCount === 1 ? "" : "s"}` : ""}
              {uploaded ? " · uploaded and analysed" : ""}
            </p>
            {!uploaded ? (
              <div className="mt-2 max-w-sm">
                <Progress value={percent} className="h-1.5" aria-label={`${percent}% uploaded`} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {phase === "creating"
                    ? "Creating the import job…"
                    : phase === "analyzing"
                      ? "Reading the workbook…"
                      : `Uploading chunk ${Math.min(currentChunk + 1, chunkCount || 1)} of ${chunkCount || 1}`}
                </p>
              </div>
            ) : null}
          </div>
          {!busy ? (
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              Replace file
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (busy) return;
            onFilePicked(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-surface px-6 py-12 text-center transition-colors hover:border-primary/40 hover:bg-primary-soft/30",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <UploadCloud className="size-8 text-muted-foreground/70" />
          <div>
            <p className="text-sm font-medium">Drop your spreadsheet here, or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">
              .xlsx, .xls or .xlsm · up to {formatBytes(limits.maxUploadBytes)}
            </p>
          </div>
          {busy ? <Spinner className="text-muted-foreground" /> : null}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(event) => {
          onFilePicked(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {uploadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{uploadError}</p>
            {file && failedFrom !== null ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void startUpload(file, failedFrom)}
              >
                <RefreshCw className="size-4" />
                Retry from chunk {failedFrom + 1}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {analysis ? (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold">Workbook contents</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick the sheet that holds the records and confirm which row contains the column
              headings.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sheet" name="sheet">
              <Select
                value={localSheet ?? undefined}
                onValueChange={(value) => {
                  setLocalSheet(value);
                  void reanalyze(value, localHeaderRow);
                }}
                disabled={reanalyzeBusy || busy}
              >
                <SelectTrigger id="sheet">
                  <SelectValue placeholder="Choose a sheet" />
                </SelectTrigger>
                <SelectContent>
                  {analysis.sheets.map((sheet) => (
                    <SelectItem key={sheet.name} value={sheet.name}>
                      {sheet.name} · {formatNumber(sheet.rowCount)} rows
                      {sheet.empty ? " (empty)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Header row"
              name="headerRow"
              hint="The worksheet row number holding the column headings."
            >
              <div className="flex gap-2">
                <Input
                  id="headerRow"
                  type="number"
                  min={1}
                  max={1000}
                  value={localHeaderRow}
                  onChange={(event) =>
                    setLocalHeaderRow(Math.max(1, Number(event.target.value) || 1))
                  }
                  disabled={reanalyzeBusy || busy}
                  className="w-28"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reanalyzeBusy || busy || !localSheet}
                  onClick={() => localSheet && void reanalyze(localSheet, localHeaderRow)}
                >
                  {reanalyzeBusy ? <Spinner className="size-4" /> : null}
                  Re-read
                </Button>
              </div>
            </Field>
          </div>

          {profile ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  <span className="font-medium">{profile.headers.length}</span> column
                  {profile.headers.length === 1 ? "" : "s"} detected
                </span>
                <span>
                  <span className="font-medium">{formatNumber(profile.totalRows)}</span> data row
                  {profile.totalRows === 1 ? "" : "s"}
                </span>
                {profile.truncated ? (
                  <span className="text-warning">analysis truncated at the row limit</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {profile.headers.map((header, index) => (
                  <span
                    key={`${header}-${index}`}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    {header || `Column ${index + 1}`}
                    {profile.profiles[index] ? (
                      <span className="ml-1 text-muted-foreground">
                        {profile.profiles[index].suggestedType.replace("_", " ")}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>

              {profile.warnings.length > 0 || ambiguousColumns.length > 0 ? (
                <Alert variant="warning">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Check these before continuing</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {profile.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                      {ambiguousColumns.length > 0 ? (
                        <li>
                          Ambiguous dates in {ambiguousColumns.join(", ")} are read as day-first
                          (DD/MM/YYYY), the organisation default.
                        </li>
                      ) : null}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <Alert variant="warning">
              <AlertTriangle className="size-4" />
              <AlertTitle>No usable sheet found</AlertTitle>
              <AlertDescription>
                The workbook appears to be empty. Pick another sheet or upload a different file.
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Rows are validated against your register before anything is written — invalid rows are
          rejected individually.
        </p>
        <Button
          disabled={!profile || busy || reanalyzeBusy}
          onClick={() =>
            profile &&
            onContinue({ sheetName: profile.sheetName, headerRow: profile.headerRow })
          }
        >
          Continue to column mapping
        </Button>
      </div>

      {target.kind === "new_register" ? (
        <p className="text-xs text-muted-foreground">
          A new register named <span className="font-medium">{target.registerName}</span> will be
          created when you save the column mapping.
        </p>
      ) : (
        <Label className="text-xs text-muted-foreground">
          Importing into register: <span className="font-medium">{target.registerName}</span>
        </Label>
      )}
    </div>
  );
}
