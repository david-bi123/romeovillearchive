"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { canAssignRole, canManageUser, isProtectedSuperAdmin, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/rbac";
import { ROLES, type Role } from "@/lib/db/schema";
import { updateUserAction, type UserListItem } from "@/server/actions/users";
import type { ActionState } from "@/server/actions/auth";

export function RoleSelect({
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
  const isSelf = user.id === actor.id;
  const locked =
    isSelf ||
    user.role === "super_admin" ||
    !canManageUser(actor.role, user.role, isSelf) ||
    isProtectedSuperAdmin(actor.role, user.role);

  const options = ROLES.filter(
    (role) => role === user.role || canAssignRole(actor.role, role),
  );

  const handleChange = async (next: string) => {
    if (next === user.role || locked || disabled) return;
    onBusyChange(user.id);
    try {
      const formData = new FormData();
      formData.set("userId", user.id);
      formData.set("role", next);
      const state: ActionState = await updateUserAction({ ok: false }, formData);
      if (state.ok) {
        toast.success(state.message ?? "Role updated.");
        router.refresh();
      } else {
        toast.error(state.message ?? "That role change was not allowed.");
      }
    } finally {
      onBusyChange(null);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="block w-44">
            <Select
              value={user.role}
              onValueChange={(value) => void handleChange(value)}
              disabled={locked || disabled}
            >
              <SelectTrigger
                className="h-8 w-44 text-xs"
                aria-label={`Role for ${user.email}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((role) => (
                  <SelectItem
                    key={role}
                    value={role}
                    disabled={!canAssignRole(actor.role, role)}
                  >
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {ROLE_DESCRIPTIONS[user.role]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
