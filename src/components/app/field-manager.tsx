"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { FIELD_TYPES, type FieldType, type RegisterField } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { FIELD_TYPE_LABELS } from "@/components/app/field-builder";
import {
  addFieldAction,
  deleteFieldAction,
  reorderFieldsAction,
  updateFieldAction,
} from "@/server/actions/registers";
import type { ActionState } from "@/server/actions/shared";
import type { FieldInput } from "@/server/registers";

const EMPTY_DRAFT = {
  name: "",
  fieldType: "text" as FieldType,
  required: false,
  helpText: "",
  defaultValue: "",
  optionsText: "",
  showInTable: true,
  showInCard: true,
  editable: true,
};

type Draft = typeof EMPTY_DRAFT;

const NEEDS_OPTIONS: FieldType[] = ["select", "multi_select"];

function draftToInput(draft: Draft): FieldInput {
  const options = draft.optionsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    name: draft.name.trim(),
    fieldType: draft.fieldType,
    required: draft.required,
    helpText: draft.helpText.trim() || null,
    defaultValue: draft.defaultValue.trim() || null,
    options: NEEDS_OPTIONS.includes(draft.fieldType) ? [...new Set(options)] : [],
    showInTable: draft.showInTable,
    showInCard: draft.showInCard,
    editable: draft.editable,
  };
}

function fieldToDraft(field: RegisterField): Draft {
  return {
    name: field.name,
    fieldType: field.fieldType,
    required: field.required,
    helpText: field.helpText ?? "",
    defaultValue: field.defaultValue ?? "",
    optionsText: ((field.options as string[] | null) ?? []).join("\n"),
    showInTable: field.showInTable,
    showInCard: field.showInCard,
    editable: field.editable,
  };
}

export function FieldManager({
  registerId,
  fields,
  canEdit,
}: {
  registerId: string;
  fields: RegisterField[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(fields);
  const [prevFields, setPrevFields] = useState(fields);
  if (prevFields !== fields) {
    setPrevFields(fields);
    setItems(fields);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<RegisterField | null>(null);
  const [confirmConvert, setConfirmConvert] = useState<{ fieldId: string; input: FieldInput; message: string } | null>(null);

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError(undefined);
    setDialogOpen(true);
  };

  const openEdit = (field: RegisterField) => {
    setEditingId(field.id);
    setDraft(fieldToDraft(field));
    setFormError(undefined);
    setDialogOpen(true);
  };

  const run = (promise: Promise<ActionState>, onSuccess?: () => void) => {
    startTransition(async () => {
      const state = await promise;
      if (state.ok) {
        toast.success(state.message ?? "Saved.");
        onSuccess?.();
        router.refresh();
        return;
      }
      toast.error(state.message ?? "Something went wrong.");
    });
  };

  const submitDialog = (allowTypeChange = false) => {
    const input = draftToInput(draft);
    if (!input.name) {
      setFormError("Give the column a name.");
      return;
    }
    if (NEEDS_OPTIONS.includes(input.fieldType) && input.options.length === 0) {
      setFormError("Add at least one option, one per line.");
      return;
    }
    if (editingId) {
      startTransition(async () => {
        const state = await updateFieldAction({
          registerId,
          fieldId: editingId,
          field: input,
          allowTypeChange: allowTypeChange || undefined,
        });
        if (state.ok) {
          toast.success(state.message ?? "Column updated.");
          setDialogOpen(false);
          router.refresh();
        } else if (state.code === "type_change_confirmation_required") {
          setDialogOpen(false);
          setConfirmConvert({ fieldId: editingId, input, message: state.message ?? "Confirm the conversion." });
        } else {
          setFormError(state.message);
        }
      });
    } else {
      run(addFieldAction({ registerId, field: input }), () => setDialogOpen(false));
    }
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    run(reorderFieldsAction(registerId, next.map((field) => field.id)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} column{items.length === 1 ? "" : "s"}. Type changes on columns with stored
          values require confirmation.
        </p>
        {canEdit ? (
          <Button size="sm" onClick={openNew} disabled={pending}>
            <Plus className="size-4" />
            Add column
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          This register has no columns yet.
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-md border border-border bg-surface">
          {items.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {field.name}
                  <Badge variant="secondary">{FIELD_TYPE_LABELS[field.fieldType]}</Badge>
                  {field.required ? <Badge variant="outline">required</Badge> : null}
                  {!field.editable ? <Badge variant="outline">locked</Badge> : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {((field.options as string[] | null) ?? []).length > 0
                    ? `${((field.options as string[] | null) ?? []).length} options · `
                    : ""}
                  {field.helpText || "No help text"}
                  {!field.showInTable ? " · hidden in table" : ""}
                </p>
              </div>
              {canEdit ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${field.name} up`}
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${field.name} down`}
                    disabled={pending || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${field.name}`}
                    disabled={pending}
                    onClick={() => openEdit(field)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${field.name}`}
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() => setDeleteTarget(field)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit column" : "Add column"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="field-name">Name</Label>
              <Input
                id="field-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. Agreement date"
                autoFocus
              />
              {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={draft.fieldType}
                  onValueChange={(value) => setDraft({ ...draft, fieldType: value as FieldType })}
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
                <Label htmlFor="field-help">Help text</Label>
                <Input
                  id="field-help"
                  value={draft.helpText}
                  onChange={(event) => setDraft({ ...draft, helpText: event.target.value })}
                  placeholder="Optional hint shown under the input"
                />
              </div>
            </div>

            {NEEDS_OPTIONS.includes(draft.fieldType) ? (
              <div className="space-y-1.5">
                <Label htmlFor="field-options">Options (one per line)</Label>
                <Textarea
                  id="field-options"
                  rows={5}
                  value={draft.optionsText}
                  onChange={(event) => setDraft({ ...draft, optionsText: event.target.value })}
                  placeholder={"Signed\nPending\nExpired"}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="field-default">Default value</Label>
              <Input
                id="field-default"
                value={draft.defaultValue}
                onChange={(event) => setDraft({ ...draft, defaultValue: event.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(
                [
                  ["required", "Required"],
                  ["showInTable", "Show in table"],
                  ["showInCard", "Show on card"],
                  ["editable", "Editable after creation"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id={`field-${key}`}
                    checked={draft[key]}
                    onCheckedChange={(value) => setDraft({ ...draft, [key]: value === true })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => submitDialog(false)} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Add column"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The column and every stored value in it are removed from this register. Other columns
              are untouched. This cannot be undone from the interface.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                const target = deleteTarget;
                setDeleteTarget(null);
                run(deleteFieldAction(registerId, target.id));
              }}
            >
              Remove column
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmConvert)}
        onOpenChange={(open) => {
          if (!open) setConfirmConvert(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm conversion</AlertDialogTitle>
            <AlertDialogDescription>{confirmConvert?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmConvert) return;
                const payload = confirmConvert;
                setConfirmConvert(null);
                run(
                  updateFieldAction({
                    registerId,
                    fieldId: payload.fieldId,
                    field: payload.input,
                    allowTypeChange: true,
                  }),
                );
              }}
            >
              Convert values
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
