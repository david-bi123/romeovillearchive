"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/app/password-input";
import { Field, FormMessage } from "@/components/app/form-primitives";
import { activateAccountAction, type ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function ActivateForm({ token, email }: { token: string; email?: string }) {
  const [state, action, pending] = useActionState(activateAccountAction, IDLE);

  return (
    <form action={action} className="space-y-4 p-6 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Activate your account</h1>
        <p className="text-sm text-muted-foreground">
          {email ? (
            <>
              Setting a password for <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            "Choose a password to finish setting up your account."
          )}
        </p>
      </div>

      <FormMessage message={state.message} errors={state.errors} />

      <input type="hidden" name="token" value={token} />

      <Field label="Full name" name="fullName" error={state.errors?.fullName}>
        <Input id="fullName" name="fullName" autoComplete="name" placeholder="Optional" />
      </Field>

      <Field
        label="Password"
        name="password"
        error={state.errors?.password}
        hint="At least 10 characters, with a letter and a number."
        required
      >
        <PasswordInput id="password" name="password" autoComplete="new-password" required autoFocus />
      </Field>

      <Field label="Confirm password" name="passwordConfirm" error={state.errors?.passwordConfirm} required>
        <PasswordInput id="passwordConfirm" name="passwordConfirm" autoComplete="new-password" required />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Activating…" : "Activate account"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
