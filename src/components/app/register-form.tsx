"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage } from "@/components/app/form-primitives";
import { createRegisterAction } from "@/server/actions/registers";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

/**
 * Minimal register creation: just a name (and optional description). The
 * register opens as a fresh sheet where columns and rows are added inline,
 * exactly like starting a new spreadsheet.
 */
export function RegisterForm() {
  const [state, action, pending] = useActionState(createRegisterAction, IDLE);

  return (
    <form action={action} className="space-y-4">
      <FormMessage message={state.message} errors={state.errors} />

      <Field label="Register name" name="name" error={state.errors?.name} required>
        <Input
          id="name"
          name="name"
          required
          maxLength={160}
          placeholder="e.g. Documents Completed"
          autoFocus
        />
      </Field>

      <Field
        label="Description"
        name="description"
        error={state.errors?.description}
        hint="Optional — what this register tracks."
      >
        <Textarea
          id="description"
          name="description"
          rows={2}
          placeholder="Optional — what this register tracks."
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button asChild type="button" variant="ghost">
          <Link href="/registers">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {pending ? "Opening your sheet…" : "Create and open sheet"}
        </Button>
      </div>
    </form>
  );
}
