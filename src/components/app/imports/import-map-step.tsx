"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { FormMessage } from "@/components/app/form-primitives";
import type { AnalyzeProfile } from "@/components/app/imports/import-upload-step";
import type { ActionState } from "@/server/actions/auth";
import { FIELD_TYPES, type FieldType } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export type WizardField = {
  id: string;
  fieldKey: string;
  name: string;
  fieldType: FieldType;
  required: boolean;
};

export type ColumnCreateDraft = {
  name: string;
  fieldType: FieldType;
  required: boolean;
  options: string[];
  helpText: string | null;
  showInTable: boolean;
  showInCard: boolean;
  editable: boolean;
};

export type ColumnPlanDraft = {
  excelIndex: number;
  header: string;
  action: "map" | "create" | "ignore";
  fieldId: string | null;
  create: ColumnCreateDraft | null;
  notes: string[];
};

export type StrategyMode = "append" | "append_skip_duplicates" | "update_existing";

type Props = {
  fields: WizardField[];
  profile: AnalyzeProfile | null;
  plans: ColumnPlanDraft[];
  onPlansChange: (plans: ColumnPlanDraft[]) => void;
  strategyMode: StrategyMode;
  onStrategyModeChange: (mode: StrategyMode) => void;
  matchFieldId: string;
  onMatchFieldChange: (fieldId: string) => void;
  createNewFields: boolean;
  onCreateNewFieldsChange: (value: boolean) => void;
  saving: boolean;
  saveState: ActionState | null;
  onSave: () => void;
  onBack: () => void;
};

const STRATEGY_LABELS: Record<StrategyMode, { label: string; hint: string }> = {
  append: {
    label: "Append every row",
    hint: "All data rows become new records. No duplicate checking.",
  },
  append_skip_duplicates: {
    label: "Append, skip duplicates",
    hint: "Rows whose match column already exists in the register are skipped.",
  },
  update_existing: {
    label: "Update existing records",
    hint: "Rows are matched to existing records by the match column and updated in place.",
  },
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  long_text: "Long text",
  integer: "Whole number",
  decimal: "Decimal number",
  date: "Date",
  datetime: "Date & time",
  boolean: "Yes / no",
  select: "Single choice",
  multi_select: "Multi choice",
  email: "Email",
  phone: "Phone",
  url: "URL",
};

function defaultCreate(header: string, suggestedType: FieldType, options: string[]): ColumnCreateDraft {
  return {
    name: header,
    fieldType: suggestedType,
    required: false,
    options,
    helpText: null,
    showInTable: true,
    showInCard: true,
    editable: true,
  };
}

export function ImportMapStep({
  fields,
  profile,
  plans,
  onPlansChange,
  strategyMode,
  onStrategyModeChange,
  matchFieldId,
  onMatchFieldChange,
  createNewFields,
  onCreateNewFieldsChange,
  saving,
  saveState,
  onSave,
  onBack,
}: Props) {
  const mappedFieldIds = new Set(
    plans.filter((plan) => plan.action === "map" && plan.fieldId).map((plan) => plan.fieldId as string),
  );
  const missingRequired = fields.filter((field) => field.required && !mappedFieldIds.has(field.id));

  const matchOptions = fields.filter(
    (field) => strategyMode === "append" || mappedFieldIds.has(field.id) || field.id === matchFieldId,
  );
  const needsMatch = strategyMode !== "append";
  const matchMissing = needsMatch && !matchFieldId;

  const updatePlan = (excelIndex: number, patch: Partial<ColumnPlanDraft>) => {
    onPlansChange(
      plans.map((plan) => (plan.excelIndex === excelIndex ? { ...plan, ...patch } : plan)),
    );
  };

  const selectValue = (plan: ColumnPlanDraft): string => {
    if (plan.action === "ignore") return "ignore";
    if (plan.action === "create") return "create";
    return plan.fieldId ? `field:${plan.fieldId}` : "ignore";
  };

  const onActionChange = (plan: ColumnPlanDraft, value: string) => {
    if (value === "ignore") {
      updatePlan(plan.excelIndex, { action: "ignore", fieldId: null, create: null });
      return;
    }
    if (value === "create") {
      const columnProfile = profile?.profiles[plan.excelIndex];
      updatePlan(plan.excelIndex, {
        action: "create",
        fieldId: null,
        create:
          plan.create ??
          defaultCreate(
            plan.header,
            columnProfile?.suggestedType ?? "text",
            columnProfile?.suggestedOptions ?? [],
          ),
      });
      return;
    }
    const fieldId = value.slice("field:".length);
    updatePlan(plan.excelIndex, { action: "map", fieldId, create: null });
  };

  const grouped = FIELD_TYPES.map((type) => ({
    type,
    fields: fields.filter((field) => field.fieldType === type),
  })).filter((group) => group.fields.length > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Map spreadsheet columns</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each column can fill an existing register column, create a new one, or be ignored.
            Suggestions are prefilled — correct anything that looks wrong.
          </p>
        </div>

        {plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No columns were detected in this sheet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Spreadsheet column</TableHead>
                <TableHead className="min-w-[120px]">Sample</TableHead>
                <TableHead className="min-w-[220px]">Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => {
                const columnProfile = profile?.profiles[plan.excelIndex];
                return (
                  <TableRow key={plan.excelIndex}>
                    <TableCell>
                      <span className="block font-medium">
                        {plan.header || `Column ${plan.excelIndex + 1}`}
                      </span>
                      {plan.notes.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-warning">
                          {plan.notes.join(" ")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {columnProfile && columnProfile.sampleValues.length > 0 ? (
                        <span className="block truncate" title={columnProfile.sampleValues.join(", ")}>
                          {columnProfile.sampleValues.slice(0, 3).join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="space-y-2">
                      <Select
                        value={selectValue(plan)}
                        onValueChange={(value) => onActionChange(plan, value)}
                      >
                        <SelectTrigger aria-label={`Target for ${plan.header || `column ${plan.excelIndex + 1}`}`}>
                          <SelectValue placeholder="Choose a target" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">Ignore this column</SelectItem>
                          <SelectItem value="create">Create new column…</SelectItem>
                          {grouped.length > 0 ? <SelectSeparator /> : null}
                          {grouped.map((group) => (
                            <React.Fragment key={group.type}>
                              <SelectLabel>{FIELD_TYPE_LABELS[group.type]}</SelectLabel>
                              {group.fields.map((field) => (
                                <SelectItem key={field.id} value={`field:${field.id}`}>
                                  {field.name}
                                  {field.required ? " *" : ""}
                                </SelectItem>
                              ))}
                            </React.Fragment>
                          ))}
                        </SelectContent>
                      </Select>

                      {plan.action === "create" && plan.create ? (
                        <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs">New column name</Label>
                            <Input
                              value={plan.create.name}
                              onChange={(event) =>
                                updatePlan(plan.excelIndex, {
                                  create: { ...plan.create!, name: event.target.value },
                                })
                              }
                              placeholder="e.g. Indenture number"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={plan.create.fieldType}
                              onValueChange={(value) =>
                                updatePlan(plan.excelIndex, {
                                  create: { ...plan.create!, fieldType: value as FieldType },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {FIELD_TYPE_LABELS[type]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end gap-2 pb-2">
                            <Checkbox
                              id={`create-required-${plan.excelIndex}`}
                              checked={plan.create.required}
                              onCheckedChange={(checked) =>
                                updatePlan(plan.excelIndex, {
                                  create: { ...plan.create!, required: checked === true },
                                })
                              }
                            />
                            <Label
                              htmlFor={`create-required-${plan.excelIndex}`}
                              className="text-xs font-normal"
                            >
                              Required column
                            </Label>
                          </div>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {missingRequired.length > 0 ? (
          <Alert variant="warning" className="mt-4">
            <AlertTriangle className="size-4" />
            <AlertTitle>Required columns are not mapped</AlertTitle>
            <AlertDescription>
              Map a spreadsheet column to {missingRequired.map((field) => field.name).join(", ")}
              — the register marks {missingRequired.length === 1 ? "it" : "them"} required, so the
              import cannot run without {missingRequired.length === 1 ? "it" : "them"}.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Duplicate handling</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose how rows that already exist in the register should be treated.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            {(Object.keys(STRATEGY_LABELS) as StrategyMode[]).map((mode) => (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50",
                  strategyMode === mode && "border-primary/50 bg-primary-soft/40",
                )}
              >
                <input
                  type="radio"
                  name="strategyMode"
                  value={mode}
                  checked={strategyMode === mode}
                  onChange={() => {
                    onStrategyModeChange(mode);
                    if (mode !== "append" && !matchFieldId) {
                      const firstMapped = plans.find((plan) => plan.action === "map" && plan.fieldId);
                      if (firstMapped?.fieldId) onMatchFieldChange(firstMapped.fieldId);
                    }
                  }}
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-sm font-medium">{STRATEGY_LABELS[mode].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {STRATEGY_LABELS[mode].hint}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {needsMatch ? (
            <div className="grid gap-1.5 sm:max-w-sm">
              <Label htmlFor="matchField" className="text-sm">
                Match column<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Select value={matchFieldId || undefined} onValueChange={onMatchFieldChange}>
                <SelectTrigger id="matchField">
                  <SelectValue placeholder="Choose the column that identifies a record" />
                </SelectTrigger>
                <SelectContent>
                  {matchOptions.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The register column whose value stays the same for one record, such as a serial or
                reference number.
              </p>
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <Checkbox
              id="createNewFields"
              checked={createNewFields}
              onCheckedChange={(checked) => onCreateNewFieldsChange(checked === true)}
            />
            <Label htmlFor="createNewFields" className="text-xs font-normal">
              Allow new register columns to be created from “Create new column” mappings
            </Label>
          </div>

          <p className="text-xs text-muted-foreground">
            Date values are read as day-first (DD/MM/YYYY) — the organisation policy. Ambiguous
            dates such as 01/02/2024 become 1 February 2024.
          </p>
        </div>
      </div>

      {saveState && !saveState.ok && saveState.message ? (
        <FormMessage message={saveState.message} errors={saveState.errors} />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button type="button" onClick={onSave} disabled={saving || missingRequired.length > 0 || matchMissing}>
          {saving ? <Spinner className="size-4" /> : <Save className="size-4" />}
          {saving ? "Saving…" : "Save mapping and review"}
        </Button>
      </div>

      {matchMissing ? (
        <p className="text-right text-xs text-destructive">
          Choose the match column before saving this strategy.
        </p>
      ) : null}
    </div>
  );
}
