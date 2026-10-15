"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormMessage } from "@/components/app/form-primitives";
import { FieldBuilder, type FieldDraft } from "@/components/app/field-builder";
import { createRegisterAction } from "@/server/actions/registers";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function RegisterForm() {
  const [state, action, pending] = useActionState(createRegisterAction, IDLE);
  const [fields, setFields] = useState<FieldDraft[]>([]);

  return (
    <form action={action} className="space-y-6">
      <FormMessage message={state.message} errors={state.errors} />

      <section className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold">Register details</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The name is shown in navigation and on exports.
          </p>
        </div>

        <Field label="Name" name="name" error={state.errors?.name} required>
          <Input id="name" name="name" required placeholder="e.g. Indenture Register" autoFocus />
        </Field>

        <Field label="Description" name="description" error={state.errors?.description}>
          <Textarea
            id="description"
            name="description"
            rows={3}
            placeholder="What this register tracks and who maintains it."
          />
        </Field>

        <Field label="Category" name="category" error={state.errors?.category} hint="Optional grouping shown on register cards.">
          <Input id="category" name="category" placeholder="e.g. Land records" />
        </Field>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold">Columns</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Types control validation, sorting and how values are exported.
          </p>
        </div>
        <FieldBuilder value={fields} onChange={setFields} idPrefix="create" />
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button asChild type="button" variant="ghost">
          <Link href="/registers">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Creating…" : "Create register"}
        </Button>
      </div>
    </form>
  );
}
