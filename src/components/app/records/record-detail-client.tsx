"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { RegisterField } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
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
import { RecordForm } from "@/components/app/records/record-form";
import {
  archiveRecordsAction,
  restoreRecordsAction,
} from "@/server/actions/records";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function RecordDetailPanel({
  registerId,
  recordId,
  fields,
  defaultValues,
  dataVersion,
  canEdit,
  initialEditing,
  view,
}: {
  registerId: string;
  recordId: string;
  fields: RegisterField[];
  defaultValues: Record<string, unknown>;
  dataVersion: number;
  canEdit: boolean;
  initialEditing?: boolean;
  view: React.ReactNode;
}) {
  const [editing, setEditing] = useState(() => Boolean(initialEditing) && canEdit);

  if (editing) {
    return (
      <RecordForm
        mode="edit"
        registerId={registerId}
        recordId={recordId}
        fields={fields}
        defaultValues={defaultValues}
        dataVersion={dataVersion}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit record
          </Button>
        </div>
      ) : null}
      {view}
    </div>
  );
}

export function RecordArchiveButton({
  registerId,
  recordId,
  archived,
}: {
  registerId: string;
  recordId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const formId = `archive-record-${recordId}`;

  const clientAction = async (
    _prev: ActionState,
    formData: FormData,
  ): Promise<ActionState> => {
    const result = archived
      ? await restoreRecordsAction(_prev, formData)
      : await archiveRecordsAction(_prev, formData);
    if (result.ok) {
      toast.success(result.message ?? (archived ? "Record restored." : "Record archived."));
      router.refresh();
    } else if (result.message) {
      toast.error(result.message);
    }
    return result;
  };

  const [, formAction, pending] = useActionState(clientAction, IDLE);

  return (
    <form action={formAction} id={formId} className="inline-flex">
      <input type="hidden" name="registerId" value={registerId} />
      <input type="hidden" name="ids" value={recordId} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={archived ? "secondary" : "outline"}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : archived ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
            {archived ? "Restore record" : "Archive record"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archived ? "Restore this record?" : "Archive this record?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archived
                ? "The record returns to the active list of this register."
                : "The record moves to the archive and stops appearing in the active list. You can restore it later from the Archived view."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="submit"
                form={formId}
                variant={archived ? "default" : "destructive"}
              >
                {archived ? "Restore" : "Archive"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
