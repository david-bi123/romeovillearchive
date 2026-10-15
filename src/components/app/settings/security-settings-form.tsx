"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormMessage, FormSuccess } from "@/components/app/form-primitives";
import { updateSecuritySettingsAction } from "@/server/actions/users";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

export function SecuritySettingsForm({ allowAdminInvitations }: { allowAdminInvitations: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(allowAdminInvitations);
  const [state, formAction, pending] = useActionState(
    (prev: ActionState, formData: FormData): Promise<ActionState> =>
      updateSecuritySettingsAction(prev, formData).then((next) => {
        if (next.ok) router.refresh();
        return next;
      }),
    IDLE,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <input type="hidden" name="allowAdminInvitations" value={String(enabled)} />

      <FormMessage message={state.message} errors={state.errors} />
      {state.ok ? <FormSuccess message={state.message ?? "Security settings saved."} /> : null}

      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="allowAdminInvitations" className="text-sm">
            Administrators may send invitations
          </Label>
          <p className="text-xs text-muted-foreground">
            When off, only the super administrator can invite new team members.
          </p>
        </div>
        <Switch
          id="allowAdminInvitations"
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Administrators may send invitations"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Sessions last 14 days before requiring a new sign in, and invitation
        links expire after 72 hours. These values are fixed for this release.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Saving…" : "Save security settings"}
      </Button>
    </form>
  );
}
