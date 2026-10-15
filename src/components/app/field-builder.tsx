"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_TYPES, type FieldType } from "@/lib/db/schema";

export type FieldDraft = {
  name: string;
  fieldType: FieldType;
  required: boolean;
  helpText: string | null;
  defaultValue: string | null;
  options: string[];
  showInTable: boolean;
  showInCard: boolean;
  editable: boolean;
};

export const EMPTY_FIELD: FieldDraft = {
  name: "",
  fieldType: "text",
  required: false,
  helpText: null,
  defaultValue: null,
  options: [],
  showInTable: true,
  showInCard: true,
  editable: true,
};

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  long_text: "Long text",
  integer: "Whole number",
  decimal: "Decimal number",
  date: "Date",
  datetime: "Date & time",
  boolean: "Yes / no",
  select: "Select (one)",
  multi_select: "Multi select",
  email: "Email",
  phone: "Phone",
  url: "URL",
};

const NEEDS_OPTIONS: FieldType[] = ["select", "multi_select"];

export function fieldDraftFromJson(value: unknown): FieldDraft {
  return { ...EMPTY_FIELD, ...(value as Partial<FieldDraft>) };
}

export function FieldBuilder({
  value,
  onChange,
  idPrefix = "field",
}: {
  value: FieldDraft[];
  onChange: (next: FieldDraft[]) => void;
  idPrefix?: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<FieldDraft>(EMPTY_FIELD);
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState<string | undefined>();

  const json = useMemo(() => JSON.stringify(value), [value]);

  const openNew = () => {
    setEditingIndex(null);
    setDraft(EMPTY_FIELD);
    setOptionsText("");
    setError(undefined);
    setDialogOpen(true);
  };

  const openEdit = (index: number) => {
    const existing = value[index];
    setEditingIndex(index);
    setDraft(existing);
    setOptionsText(existing.options.join("\n"));
    setError(undefined);
    setDialogOpen(true);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => {
    const field = value[index];
    onChange(value.filter((_, i) => i !== index));
    toast.info(`Removed "${field.name}"`);
  };

  const save = () => {
    const name = draft.name.trim();
    if (!name) {
      setError("Give the field a name.");
      return;
    }
    const clash = value.some(
      (field, index) => index !== editingIndex && field.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      setError("A field with this name already exists.");
      return;
    }

    const options = optionsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (NEEDS_OPTIONS.includes(draft.fieldType) && options.length === 0) {
      setError("Add at least one option, one per line.");
      return;
    }

    const nextField: FieldDraft = {
      ...draft,
      name,
      options: NEEDS_OPTIONS.includes(draft.fieldType) ? [...new Set(options)] : [],
      helpText: draft.helpText?.trim() ? draft.helpText.trim() : null,
      defaultValue: draft.defaultValue?.trim() ? draft.defaultValue.trim() : null,
    };

    const next = [...value];
    if (editingIndex === null) next.push(nextField);
    else next[editingIndex] = nextField;
    onChange(next);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="fieldsJson" value={json} id={`${idPrefix}-json`} />

      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          No columns yet. Add the columns that describe your records — you can change the layout
          later.
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-md border border-border">
          {value.map((field, index) => (
            <li key={`${field.name}-${index}`} className="flex items-center gap-2 px-3 py-2">
              <GripVertical className="size-4 shrink-0 text-muted-foreground/60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{field.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {FIELD_TYPE_LABELS[field.fieldType]}
                  {field.required ? " · required" : ""}
                  {field.options.length ? ` · ${field.options.length} options` : ""}
                  {!field.showInTable ? " · hidden in table" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${field.name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${field.name} down`}
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Edit ${field.name}`}
                onClick={() => openEdit(index)}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${field.name}`}
                className="text-destructive hover:text-destructive"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <Button type="button" variant="outline" size="sm" onClick={openNew}>
        <Plus className="size-4" />
        Add column
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingIndex === null ? "Add column" : "Edit column"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-name`}>Name</Label>
              <Input
                id={`${idPrefix}-name`}
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. Agreement date"
                autoFocus
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={draft.fieldType}
                  onValueChange={(next) =>
                    setDraft({ ...draft, fieldType: next as FieldType })
                  }
                >
                  <SelectTrigger className="w-full">
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

              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-help`}>Help text</Label>
                <Input
                  id={`${idPrefix}-help`}
                  value={draft.helpText ?? ""}
                  onChange={(event) => setDraft({ ...draft, helpText: event.target.value })}
                  placeholder="Optional hint shown under the input"
                />
              </div>
            </div>

            {NEEDS_OPTIONS.includes(draft.fieldType) ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-options`}>Options (one per line)</Label>
                <Textarea
                  id={`${idPrefix}-options`}
                  rows={5}
                  value={optionsText}
                  onChange={(event) => setOptionsText(event.target.value)}
                  placeholder={"Signed\nPending\nExpired"}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-default`}>Default value</Label>
              <Input
                id={`${idPrefix}-default`}
                value={draft.defaultValue ?? ""}
                onChange={(event) => setDraft({ ...draft, defaultValue: event.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Toggle
                id={`${idPrefix}-required`}
                label="Required"
                checked={draft.required}
                onCheckedChange={(next) => setDraft({ ...draft, required: next })}
              />
              <Toggle
                id={`${idPrefix}-table`}
                label="Show in table"
                checked={draft.showInTable}
                onCheckedChange={(next) => setDraft({ ...draft, showInTable: next })}
              />
              <Toggle
                id={`${idPrefix}-card`}
                label="Show on card"
                checked={draft.showInCard}
                onCheckedChange={(next) => setDraft({ ...draft, showInCard: next })}
              />
              <Toggle
                id={`${idPrefix}-editable`}
                label="Editable after creation"
                checked={draft.editable}
                onCheckedChange={(next) => setDraft({ ...draft, editable: next })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              {editingIndex === null ? "Add column" : "Save column"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      {label}
    </label>
  );
}

export { Badge, FIELD_TYPE_LABELS };
