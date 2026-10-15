"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FormMessage, FormSuccess } from "@/components/app/form-primitives";
import { canAssignRole, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/rbac";
import { ROLES, type Role } from "@/lib/db/schema";
import { inviteUserAction } from "@/server/actions/users";
import type { ActionState } from "@/server/actions/auth";

const IDLE: ActionState = { ok: false };

function InviteForm({
  assignable,
  onDone,
}: {
  assignable: Role[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(assignable[0] ?? "viewer");
  const [state, formAction, pending] = useActionState(
    (prev: ActionState, formData: FormData): Promise<ActionState> =>
      inviteUserAction(prev, formData).then((next) => {
        if (next.ok) router.refresh();
        return next;
      }),
    IDLE,
  );

  if (state.ok) {
    return (
      <div className="space-y-4">
        <FormSuccess message={state.message ?? "Invitation sent."} />
        <p className="text-xs text-muted-foreground">
          The personal link is delivered by email and expires in 72 hours. If
          the email could not be sent, use Resend on the invitation row once
          email delivery is working.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onDone}>
            Invite another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage message={state.message} errors={state.errors} />

      <Field label="Email address" name="email" error={state.errors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="off"
          maxLength={255}
          placeholder="colleague@example.com"
          required
          autoFocus
        />
      </Field>

      <Field label="Full name" name="fullName" error={state.errors?.fullName} hint="Optional — shown in the team list.">
        <Input id="fullName" name="fullName" maxLength={160} />
      </Field>

      <Field
        label="Role"
        name="role"
        error={state.errors?.role}
        hint={ROLE_DESCRIPTIONS[role]}
        required
      >
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={(value) => setRole(value as Role)}>
          <SelectTrigger className="w-full" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assignable.map((candidate) => (
              <SelectItem key={candidate} value={candidate}>
                {ROLE_LABELS[candidate]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Message" name="message" error={state.errors?.message} hint="Optional — added to the invitation email.">
        <Textarea
          id="message"
          name="message"
          rows={3}
          maxLength={1000}
          placeholder="A short note about the access they need…"
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

export function InviteDialog({ actorRole }: { actorRole: Role }) {
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const assignable = ROLES.filter((role) => canAssignRole(actorRole, role));
  if (assignable.length === 0) return null;

  const close = () => {
    setOpen(false);
    setNonce((value) => value + 1);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Invite teammate
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They receive a single use link that activates the account with
              the role you pick. You can resend or revoke it later.
            </DialogDescription>
          </DialogHeader>
          <InviteForm key={nonce} assignable={assignable} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}
