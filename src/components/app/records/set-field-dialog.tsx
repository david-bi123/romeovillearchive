"use client";

import { useActionState, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { RegisterField } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldInput } from "@/components/app/records/field-input";
import { bulkSetFieldAction } from "@/server/actions/records";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function SetFieldDialog({
  registerId,
  fields,
  selectedCount,
  selectedIds,
  onCompleted,
}: {
  registerId: string;
  fields: RegisterField[];
  selectedCount: number;
  selectedIds: string[];
  onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState("");

  const clientAction = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = await bulkSetFieldAction(_prev, formData);
    if (result.ok) {
      toast.success(result.message ?? "Records updated.");
      setOpen(false);
      setFieldId("");
      onCompleted();
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(clientAction, IDLE);
  const field = fields.find((candidate) => candidate.id === fieldId) ?? null;
  const disabled = selectedCount === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Wand2 className="size-4" />
          Set field…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set a field on {selectedCount} record{selectedCount === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            The chosen column is overwritten on every selected record. Empty values clear the
            existing content.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="registerId" value={registerId} />
          <input type="hidden" name="ids" value={selectedIds.join(",")} />
          <input type="hidden" name="fieldId" value={fieldId} />

          {state.message && !state.ok ? (
            <p className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-sm">Column</span>
            <Select value={fieldId} onValueChange={setFieldId}>
              <SelectTrigger aria-label="Column to update">
                <SelectValue placeholder="Choose a column…" />
              </SelectTrigger>
              <SelectContent>
                {fields.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {field ? (
            <FieldInput field={field} name="value" error={state.errors?.value} disabled={pending} />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !field}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Update {selectedCount} record{selectedCount === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
