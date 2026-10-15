"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, FormSuccess } from "@/components/app/form-primitives";
import { forgotPasswordAction, type ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, IDLE);

  return (
    <form action={action} className="space-y-4 p-6 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email registered with your account. If it exists we send a single-use reset
          link that expires in one hour.
        </p>
      </div>

      <FormMessage message={state.message} errors={state.errors} />
      {state.ok ? <FormSuccess message={state.message} /> : null}

      <Field label="Email" name="email" error={state.errors?.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
