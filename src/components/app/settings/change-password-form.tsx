"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, FormSuccess } from "@/components/app/form-primitives";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { changePasswordAction, type ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    (prev: ActionState, formData: FormData): Promise<ActionState> => {
      const current = String(formData.get("newPassword") ?? "");
      const confirm = String(formData.get("passwordConfirm") ?? "");
      if (current !== confirm) {
        return Promise.resolve({
          ok: false,
          message: "The two new passwords do not match.",
        });
      }
      return changePasswordAction(prev, formData);
    },
    IDLE,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <FormMessage message={state.message} errors={state.errors} />
      {state.ok ? <FormSuccess message={state.message} /> : null}

      <Field label="Current password" name="currentPassword" required>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field
        label="New password"
        name="newPassword"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a mix of letters and numbers.`}
        required
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </Field>

      <Field label="Confirm new password" name="passwordConfirm" required>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
