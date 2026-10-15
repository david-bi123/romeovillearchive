"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage } from "@/components/app/form-primitives";
import { resetPasswordAction, type ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resetPasswordAction, IDLE);
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState<string | undefined>();

  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Password updated. You can sign in now.");
      router.push("/login");
    }
  }, [state, router]);

  return (
    <form
      action={(formData) => {
        const password = String(formData.get("password") ?? "");
        if (confirm !== password) {
          setMismatch("The two passwords do not match.");
          return;
        }
        setMismatch(undefined);
        void action(formData);
      }}
      className="space-y-4 p-6 sm:p-7"
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          The link is single use and expires one hour after it was requested. Every existing
          session of this account is signed out.
        </p>
      </div>

      <FormMessage message={state.message} errors={state.errors} />

      <input type="hidden" name="token" value={token} />

      <Field
        label="New password"
        name="password"
        error={state.errors?.password}
        hint="At least 10 characters, with a letter and a number."
        required
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
      </Field>

      <Field label="Confirm password" name="passwordConfirm" error={mismatch} required>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Updating…" : "Update password"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
