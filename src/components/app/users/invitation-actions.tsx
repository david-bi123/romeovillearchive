"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, X } from "lucide-react";
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
import { resendInvitationAction, revokeInvitationAction } from "@/server/actions/users";

export function InvitationActions({
  invitationId,
  email,
  expired,
  disabled,
}: {
  invitationId: string;
  email: string;
  expired: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"resend" | "revoke" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = async (kind: "resend" | "revoke") => {
    setPending(kind);
    try {
      const state =
        kind === "resend"
          ? await resendInvitationAction(invitationId)
          : await revokeInvitationAction(invitationId);
      if (state.ok) {
        toast.success(state.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(state.message ?? "That did not work.");
      }
    } finally {
      setPending(null);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Resend invitation to ${email}`}
        disabled={disabled || pending !== null}
        onClick={() => void run("resend")}
      >
        {pending === "resend" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Revoke invitation for ${email}`}
        disabled={disabled || expired || pending !== null}
        onClick={() => setConfirmOpen(true)}
      >
        {pending === "revoke" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <X className="size-4" />
        )}
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The link sent to {email} will stop working immediately. The
              invitation stays visible here with a Revoked status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending !== null}
              onClick={() => void run("revoke")}
            >
              Revoke invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
