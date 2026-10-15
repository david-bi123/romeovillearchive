"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage } from "@/components/app/form-primitives";
import type { Register } from "@/lib/db/schema";
import {
  deleteRegisterAction,
  duplicateRegisterAction,
  setRegisterArchivedAction,
  updateRegisterSettingsAction,
} from "@/server/actions/registers";
import type { ActionState } from "@/server/actions/shared";

const IDLE: ActionState = { ok: false };

export function RegisterSettingsForm({
  register,
  canEdit,
  canArchive,
  canDelete,
  canDuplicate,
  recordCount,
}: {
  register: Register;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  recordCount: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateRegisterSettingsAction, IDLE);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [transitioning, startTransition] = useTransition();

  const toggleArchived = () => {
    const next = register.status !== "archived";
    startTransition(async () => {
      const result = await setRegisterArchivedAction(register.id, next);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        if (next) router.push("/registers?archived=1");
        else router.push(`/registers/${register.id}`);
        router.refresh();
      } else {
        toast.error(result.message ?? "Something went wrong.");
      }
    });
  };

  const duplicate = () => {
    startTransition(async () => {
      const result = await duplicateRegisterAction(register.id);
      if (result.ok) {
        toast.success(result.message ?? "Copied.");
        if (result.redirectTo) router.push(result.redirectTo);
        router.refresh();
      } else {
        toast.error(result.message ?? "Something went wrong.");
      }
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteRegisterAction(register.id);
      if (result.ok) {
        toast.success("Register deleted.");
        router.push("/registers");
        router.refresh();
      } else {
        toast.error(result.message ?? "Something went wrong.");
        setDeleteOpen(false);
      }
    });
  };

  return (
    <div className="space-y-8">
      <form action={action} className="max-w-2xl space-y-4">
        <input type="hidden" name="registerId" value={register.id} />
        <FormMessage message={state.message} errors={state.errors} />

        <Field label="Name" name="name" error={state.errors?.name} required>
          <Input
            id="name"
            name="name"
            defaultValue={register.name}
            required
            disabled={!canEdit || pending}
          />
        </Field>

        <Field label="Description" name="description" error={state.errors?.description}>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={register.description ?? ""}
            disabled={!canEdit || pending}
          />
        </Field>

        <Field
          label="Category"
          name="category"
          error={state.errors?.category}
          hint="Optional grouping shown on register cards."
        >
          <Input
            id="category"
            name="category"
            defaultValue={register.category ?? ""}
            disabled={!canEdit || pending}
          />
        </Field>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">You can view settings but not change them.</p>
        )}
      </form>

      <section className="max-w-2xl space-y-3 rounded-lg border border-destructive/30 bg-destructive-soft/40 p-4">
        <div>
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {recordCount.toLocaleString("en-GB")} record
            {recordCount === 1 ? "" : "s"} currently stored in this register.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canArchive ? (
            <Button
              type="button"
              variant="outline"
              disabled={transitioning}
              onClick={() => setArchiveOpen(true)}
            >
              {register.status === "archived" ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
              {register.status === "archived" ? "Restore register" : "Archive register"}
            </Button>
          ) : null}

          {canDuplicate ? (
            <Button type="button" variant="outline" disabled={transitioning} onClick={duplicate}>
              {transitioning ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
              Duplicate with columns
            </Button>
          ) : null}

          {canDelete ? (
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={transitioning}
              onClick={() => {
                setDeleteConfirm("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="size-4" />
              Delete register
            </Button>
          ) : null}
        </div>

        {!canDelete && recordCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Deleting is limited to administrators and fails while records remain — archive instead,
            or clear the records first.
          </p>
        ) : null}
      </section>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {register.status === "archived" ? "Restore this register?" : "Archive this register?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {register.status === "archived"
                ? "The register becomes available again to everyone with access."
                : "Archived registers are hidden from day-to-day use. Records are kept and the register can be restored."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={toggleArchived}>
              {register.status === "archived" ? "Restore" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{register.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Type the register name to confirm. The register and its schema are removed; registers
              that still hold records cannot be deleted until the records are cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">Register name</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={register.name}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirm.trim() !== register.name}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={remove}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
