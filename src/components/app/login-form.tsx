"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/app/form-primitives";
import { loginAction, type ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, IDLE);

  return (
    <form action={action} className="space-y-4 p-6 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use your Romeoville Archive account. Accounts are invitation only.
        </p>
      </div>

      <FormMessage message={state.message} errors={state.errors} />

      <Field label="Email" name="email" error={state.errors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
        />
      </Field>

      <Field label="Password" name="password" error={state.errors?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          Forgot your password?
        </Link>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Back
        </Link>
      </div>
    </form>
  );
}
