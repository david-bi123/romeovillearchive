"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, LogOut } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canManageUser } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";
import { revokeUserSessionsAction, type UserListItem } from "@/server/actions/users";

export function UserRowActions({
  user,
  actor,
  disabled,
  onBusyChange,
}: {
  user: UserListItem;
  actor: { id: string; role: Role };
  disabled: boolean;
  onBusyChange: (userId: string | null) => void;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const isSelf = user.id === actor.id;
  const locked = isSelf || !canManageUser(actor.role, user.role, isSelf);

  const run = async () => {
    setPending(true);
    onBusyChange(user.id);
    try {
      const state = await revokeUserSessionsAction(user.id);
      if (state.ok) {
        toast.success(state.message ?? "Sessions revoked.");
        router.refresh();
      } else {
        toast.error(state.message ?? "Could not revoke sessions.");
      }
    } finally {
      setPending(false);
      onBusyChange(null);
      setConfirmOpen(false);
    }
  };

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${user.email}`}
            disabled={locked || disabled || pending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={disabled || pending}
            onSelect={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="size-4" />
            Revoke all sessions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke all sessions?</AlertDialogTitle>
          <AlertDialogDescription>
            Every device signed in as {user.email} will be signed out
            immediately. They will need to sign in again with their password.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={() => void run()}>
            Revoke sessions
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
