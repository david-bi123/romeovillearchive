"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileUp,
  Plus,
  Rocket,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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
import { Field } from "@/components/app/form-primitives";
import {
  ImportUploadStep,
  type AnalyzeResult,
  type UploadTarget,
} from "@/components/app/imports/import-upload-step";
import {
  ImportMapStep,
  type ColumnPlanDraft,
  type StrategyMode,
  type WizardField,
} from "@/components/app/imports/import-map-step";
import { cancelImportAction, saveImportConfigAction, startImportAction } from "@/server/actions/imports";
import type { SaveImportConfigInput } from "@/server/imports";
import type { ValidationSummary } from "@/lib/import/engine";
import { formatNumber } from "@/lib/utils";

type ImportableRegister = {
  id: string;
  name: string;
  description: string | null;
  recordCount: number;
};

type Step = "pick" | "upload" | "map" | "review";

type Props = {
  registerTarget: { registerId: string; registerName: string } | null;
  fields: WizardField[];
  importable: ImportableRegister[];
  canCreateRegister: boolean;
  limits: { maxUploadBytes: number; maxImportRows: number };
};

const STRATEGY_LABELS: Record<StrategyMode, string> = {
  append: "Append every row",
  append_skip_duplicates: "Append, skip duplicates",
  update_existing: "Update existing records",
};

export function ImportWizard({
  registerTarget,
  fields,
  importable,
  canCreateRegister,
  limits,
}: Props) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(registerTarget ? "upload" : "pick");
  const [target, setTarget] = useState<UploadTarget | null>(
    registerTarget
      ? { kind: "existing_register", registerId: registerTarget.registerId, registerName: registerTarget.registerName }
      : null,
  );
  const [activeFields, setActiveFields] = useState<WizardField[]>(fields);

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState(1);

  const [plans, setPlans] = useState<ColumnPlanDraft[]>([]);
  const [strategyMode, setStrategyMode] = useState<StrategyMode>("append");
  const [matchFieldId, setMatchFieldId] = useState("");
  const [createNewFields, setCreateNewFields] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [starting, setStarting] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);

  /** Moves to a wizard step and brings it into view (long pages). */
  const goStep = (next: Step) => {
    setStep(next);
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const filteredRegisters = importable.filter((register) =>
    pickerSearch.trim()
      ? register.name.toLowerCase().includes(pickerSearch.trim().toLowerCase())
      : true,
  );

  const chooseNewRegister = () => {
    const name = newName.trim();
    if (name.length < 2) {
      toast.error("Enter a name for the new register (at least 2 characters).");
      return;
    }
    setTarget({ kind: "new_register", registerName: name });
    setActiveFields([]);
    goStep("upload");
  };

  const onUploadContinue = (input: { sheetName: string; headerRow: number }) => {
    if (!analysis) return;
    setSheetName(input.sheetName);
    setHeaderRow(input.headerRow);
    setPlans(
      analysis.suggestedMapping.map((entry) => ({
        excelIndex: entry.excelIndex,
        header: entry.header,
        action: entry.action,
        fieldId: entry.action === "map" ? entry.fieldId : null,
        create: entry.create
          ? {
              name: entry.create.name,
              fieldType: entry.create.fieldType,
              required: entry.create.required,
              options: entry.create.options,
              helpText: entry.create.helpText,
              showInTable: entry.create.showInTable,
              showInCard: entry.create.showInCard,
              editable: entry.create.editable,
            }
          : null,
        notes: entry.notes,
      })),
    );
    goStep("map");
  };

  const saveMapping = async () => {
    if (!jobId || !sheetName) return;
    const newRegister = target?.kind === "new_register" ? target : null;
    const input: SaveImportConfigInput = {
      jobId,
      sheetName,
      headerRow,
      ...(newRegister
        ? {
            registerName: newRegister.registerName,
            registerDescription: newDescription.trim() || undefined,
          }
        : {}),
      mapping: {
        sheetName,
        headerRow,
        columns: plans.map((plan) => ({
          excelIndex: plan.excelIndex,
          header: plan.header,
          action: plan.action,
          fieldId: plan.action === "map" ? plan.fieldId : null,
          create:
            plan.action === "create" && plan.create
              ? {
                  name: plan.create.name,
                  fieldType: plan.create.fieldType,
                  required: plan.create.required,
                  options: plan.create.options,
                  helpText: plan.create.helpText,
                  showInTable: plan.create.showInTable,
                  showInCard: plan.create.showInCard,
                  editable: plan.create.editable,
                }
              : null,
        })),
      },
      strategy: {
        mode: strategyMode,
        matchFieldId: strategyMode === "append" ? null : matchFieldId || null,
        createNewFields,
      },
    };

    setSaving(true);
    setSaveMessage(undefined);
    try {
      const result = await saveImportConfigAction(input);
      if (result.ok) {
        setValidation(result.data?.summary ?? null);
        goStep("review");
        toast.success(result.message ?? "Configuration saved.");
      } else {
        setSaveMessage(result.message);
      }
    } catch {
      toast.error("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const startImport = async () => {
    if (!jobId) return;
    setStarting(true);
    try {
      const result = await startImportAction(jobId);
      if (result.ok) {
        toast.success(result.message ?? "Import started.");
        router.push(`/imports/${jobId}`);
      } else {
        toast.error(result.message ?? "The import could not be started.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const cancelJob = async () => {
    if (!jobId) {
      router.push("/imports");
      return;
    }
    try {
      const result = await cancelImportAction(jobId);
      if (result.ok) {
        toast.success(result.message ?? "The import was cancelled.");
      } else {
        toast.error(result.message ?? "The import could not be cancelled.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
    router.push("/imports");
  };

  const mappedCount = plans.filter((plan) => plan.action === "map").length;
  const createdCount = plans.filter((plan) => plan.action === "create").length;
  const ignoredPlans = plans.filter((plan) => plan.action === "ignore");
  const mappedFields = activeFields.filter((field) =>
    plans.some((plan) => plan.action === "map" && plan.fieldId === field.id),
  );
  const profileRows = analysis?.profile?.totalRows ?? 0;

  if (step === "pick") {
    return (
      <div ref={topRef} className="space-y-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Step 1 of 4 — Choose where the data goes
        </p>
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Choose the target register</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Only registers you are allowed to import into are listed.
            </p>
          </div>

          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              placeholder="Search registers…"
              className="pl-8"
              aria-label="Search registers"
            />
          </div>

          {filteredRegisters.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {importable.length === 0
                ? canCreateRegister
                  ? "No registers exist yet. Create the first one below to import into it."
                  : "You do not have access to import into any register yet. Ask an administrator to grant import access."
                : "No registers match your search."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {filteredRegisters.map((register) => (
                <li key={register.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/imports/new?registerId=${register.id}`)}
                    className="flex h-full w-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
                  >
                    <span className="truncate text-sm font-semibold">{register.name}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {register.description || "No description"}
                    </span>
                    <span className="mt-auto pt-2 text-xs text-muted-foreground">
                      {formatNumber(register.recordCount)} record
                      {register.recordCount === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canCreateRegister ? (
          <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">Or create a new register</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The spreadsheet columns become the register columns — you map them in the next
                step.
              </p>
            </div>
            <div className="grid max-w-lg gap-4">
              <Field label="Register name" name="new-register-name" required>
                <Input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="e.g. Indenture Register 2026"
                />
              </Field>
              <Field label="Description" name="new-register-description">
                <Textarea
                  rows={2}
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  placeholder="Optional — what this register tracks."
                />
              </Field>
              <div>
                <Button onClick={chooseNewRegister}>
                  <Plus className="size-4" />
                  Continue to upload
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Next you will choose the Excel file from your computer.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (!target) return null;

  return (
    <div ref={topRef} className="space-y-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        Step 2 of 4 — Upload the spreadsheet
      </p>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Import progress">
        {(["upload", "map", "review"] as const).map((key, index) => {
          const order = { upload: 0, map: 1, review: 2 };
          const current = order[step as "upload" | "map" | "review"] ?? 0;
          const state = index < current ? "done" : index === current ? "current" : "todo";
          const label = key === "upload" ? "Upload" : key === "map" ? "Map columns" : "Review";
          return (
            <li key={key} className="flex items-center gap-1.5">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={
                  state === "current"
                    ? "inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground shadow-card"
                    : state === "done"
                      ? "inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 font-medium text-primary"
                      : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-medium text-muted-foreground"
                }
              >
                {state === "done" ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span className="tabular-nums" aria-hidden>
                    {index + 1}
                  </span>
                )}
                {label}
              </span>
              {index < 2 ? (
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              ) : null}
            </li>
          );
        })}
        {jobId ? (
          <li className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[11px]">
              draft job
            </Badge>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  <XCircle className="size-4" />
                  Cancel import
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Abandon this import?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The draft job and its uploaded file are cancelled. Nothing has been written to
                    the register.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep working</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void cancelJob()}>
                    Cancel import
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        ) : null}
      </ol>

      <div hidden={step !== "upload"}>
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <ImportUploadStep
            target={target}
            limits={limits}
            jobId={jobId}
            analysis={analysis}
            sheetName={sheetName}
            headerRow={headerRow}
            onJobReady={setJobId}
            onAnalysis={setAnalysis}
            onContinue={onUploadContinue}
          />
        </div>
      </div>

      {analysis ? (
        <div hidden={step !== "map"}>
          <ImportMapStep
            fields={activeFields}
            profile={analysis.profile}
            plans={plans}
            onPlansChange={setPlans}
            strategyMode={strategyMode}
            onStrategyModeChange={setStrategyMode}
            matchFieldId={matchFieldId}
            onMatchFieldChange={setMatchFieldId}
            createNewFields={createNewFields}
            onCreateNewFieldsChange={setCreateNewFields}
            saving={saving}
            saveState={saveMessage ? { ok: false, message: saveMessage } : null}
            onSave={() => void saveMapping()}
            onBack={() => goStep("upload")}
          />
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-semibold">Review and start</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing is written until you press start. Invalid rows are rejected individually and
              listed on the job page.
            </p>
          </div>

          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Register</dt>
              <dd className="mt-0.5 flex items-center gap-2 font-medium">
                {target.registerName}
                {target.kind === "new_register" ? (
                  <Badge variant="info">new register</Badge>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Source</dt>
              <dd className="mt-0.5 font-medium">
                Sheet “{sheetName}” · header row {headerRow} ·{" "}
                {formatNumber(validation?.totalRows ?? profileRows)} data rows
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Duplicates</dt>
              <dd className="mt-0.5 font-medium">{STRATEGY_LABELS[strategyMode]}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Dates</dt>
              <dd className="mt-0.5 font-medium">Day-first (DD/MM/YYYY)</dd>
            </div>
          </dl>

          <Separator />

          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Mapped columns ({mappedCount})
              </p>
              <ul className="mt-1 space-y-0.5">
                {plans
                  .filter((plan) => plan.action === "map")
                  .map((plan) => {
                    const field = activeFields.find((candidate) => candidate.id === plan.fieldId);
                    return (
                      <li key={plan.excelIndex}>
                        <span className="text-foreground">{plan.header || `Column ${plan.excelIndex + 1}`}</span>
                        <span className="text-muted-foreground"> → {field?.name ?? "column"}</span>
                      </li>
                    );
                  })}
                {mappedCount === 0 ? (
                  <li className="text-muted-foreground">None — all columns are new or ignored.</li>
                ) : null}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                New columns ({createdCount})
              </p>
              <ul className="mt-1 space-y-0.5">
                {plans
                  .filter((plan) => plan.action === "create")
                  .map((plan) => (
                    <li key={plan.excelIndex}>
                      {plan.create?.name || plan.header || `Column ${plan.excelIndex + 1}`}
                      {plan.create ? (
                        <span className="text-muted-foreground"> · {plan.create.fieldType.replace("_", " ")}</span>
                      ) : null}
                    </li>
                  ))}
                {createdCount === 0 ? <li className="text-muted-foreground">None</li> : null}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Ignored columns ({ignoredPlans.length})
              </p>
              <ul className="mt-1 space-y-0.5">
                {ignoredPlans.map((plan) => (
                  <li key={plan.excelIndex} className="text-muted-foreground">
                    {plan.header || `Column ${plan.excelIndex + 1}`}
                  </li>
                ))}
                {ignoredPlans.length === 0 ? (
                  <li className="text-muted-foreground">None</li>
                ) : null}
              </ul>
            </div>
          </div>

          {mappedFields.length > 0 && strategyMode !== "append" ? (
            <p className="text-xs text-muted-foreground">
              Matching on{" "}
              <span className="font-medium">
                {activeFields.find((field) => field.id === matchFieldId)?.name ?? "—"}
              </span>
              .
            </p>
          ) : null}

          {validation ? (
            <Alert
              variant={
                validation.invalidRows > 0 || validation.warnings.length > 0
                  ? "warning"
                  : "success"
              }
            >
              {validation.invalidRows > 0 || validation.warnings.length > 0 ? (
                <AlertTriangle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              <AlertTitle>
                {validation.invalidRows > 0
                  ? `${formatNumber(validation.invalidRows)} row${validation.invalidRows === 1 ? "" : "s"} will be rejected`
                  : "Validation passed on the preview sample"}
              </AlertTitle>
              <AlertDescription>
                <span>
                  {formatNumber(validation.validRows)} of {formatNumber(validation.totalRows)} rows
                  look valid
                  {validation.emptyRows > 0
                    ? `, ${formatNumber(validation.emptyRows)} empty row${validation.emptyRows === 1 ? "" : "s"} will be skipped`
                    : ""}
                  {validation.duplicateRows > 0
                    ? `, ${formatNumber(validation.duplicateRows)} duplicate${validation.duplicateRows === 1 ? "" : "s"} detected`
                    : ""}
                  .
                </span>
                {validation.warnings.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {validation.warnings.slice(0, 5).map((warning) => (
                      <li key={`${warning.rowNumber}-${warning.message}`}>
                        Row {warning.rowNumber}: {warning.message}
                      </li>
                    ))}
                    {validation.warnings.length > 5 ? (
                      <li>…and {validation.warnings.length - 5} more.</li>
                    ) : null}
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goStep("map")}
              disabled={starting}
            >
              <ArrowLeft className="size-4" />
              Back to mapping
            </Button>
            <Button type="button" onClick={() => void startImport()} disabled={starting || saving}>
              {starting ? <Spinner className="size-4" /> : <Rocket className="size-4" />}
              {starting ? "Starting…" : "Start import"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "upload" && jobId ? (
        <p className="text-xs text-muted-foreground">
          Your draft job is saved server-side — leaving this page keeps the upload, but the mapping
          must be finished before the import can start.
        </p>
      ) : null}

      {step === "upload" && !jobId ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileUp className="size-3.5" />
          Step 1 of 3 — choose a spreadsheet to begin.
        </div>
      ) : null}
    </div>
  );
}
