"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RegisterField } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/app/form-primitives";
import { FieldInput } from "@/components/app/records/field-input";
import { fieldValueName } from "@/components/app/records/record-form-data";
import {
  createRecordAction,
  updateRecordAction,
} from "@/server/actions/records";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function RecordForm({
  mode,
  registerId,
  recordId,
  fields,
  defaultValues,
  dataVersion,
  onCancel,
  createdHint,
}: {
  mode: "create" | "edit";
  registerId: string;
  recordId?: string;
  fields: RegisterField[];
  defaultValues?: Record<string, unknown>;
  dataVersion?: number;
  onCancel?: () => void;
  createdHint?: boolean;
}) {
  const router = useRouter();

  const clientAction = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result =
      mode === "create"
        ? await createRecordAction(_prev, formData)
        : await updateRecordAction(_prev, formData);
    if (mode === "edit" && result.ok) {
      toast.success(result.message ?? "Record saved.");
      onCancel?.();
      router.refresh();
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(clientAction, IDLE);

  return (
    <form action={formAction} className="space-y-6">
      {createdHint ? (
        <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          Record created.
        </p>
      ) : null}

      <input type="hidden" name="registerId" value={registerId} />
      {recordId ? <input type="hidden" name="recordId" value={recordId} /> : null}
      {mode === "edit" && typeof dataVersion === "number" ? (
        <input type="hidden" name="dataVersion" value={dataVersion} />
      ) : null}

      <FormMessage message={state.message} errors={state.errors} />

      <div className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This register has no columns yet, so there is nothing to fill in.
          </p>
        ) : (
          fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              name={fieldValueName(field.id)}
              defaultValue={defaultValues?.[field.id]}
              error={state.errors?.[field.id]}
              disabled={pending}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : (
          <Button asChild type="button" variant="ghost">
            <Link href={`/registers/${registerId}`}>Cancel</Link>
          </Button>
        )}
        <Button type="submit" disabled={pending || fields.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create record"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
