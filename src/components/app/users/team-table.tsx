"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import type { Role } from "@/lib/db/schema";
import type { UserListItem } from "@/server/actions/users";
import { RoleSelect } from "@/components/app/users/role-select";
import { UserRowActions } from "@/components/app/users/user-row-actions";

const STATUS_BADGE: Record<
  UserListItem["status"],
  { label: string; variant: "success" | "warning" | "secondary" }
> = {
  active: { label: "Active", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  disabled: { label: "Deactivated", variant: "secondary" },
};

export function TeamTable({
  users,
  actor,
  canManage,
}: {
  users: UserListItem[];
  actor: { id: string; role: Role };
  canManage: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = busyId !== null;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last active</TableHead>
          <TableHead>Sessions</TableHead>
          {canManage ? <TableHead className="w-14 text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const status = STATUS_BADGE[user.status];
          return (
            <TableRow
              key={user.id}
              aria-busy={busyId === user.id || undefined}
              className={cn(busyId === user.id && "opacity-60")}
            >
              <TableCell className="min-w-48">
                <p className="truncate text-sm font-medium">
                  {user.fullName ?? user.email}
                </p>
                {user.fullName ? (
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                ) : null}
              </TableCell>
              <TableCell>
                <RoleSelect
                  user={user}
                  actor={actor}
                  disabled={busy}
                  onBusyChange={setBusyId}
                />
              </TableCell>
              <TableCell>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell>
                {user.lastLoginAt ? (
                  <span
                    className="text-sm text-muted-foreground"
                    title={formatDate(user.lastLoginAt, true)}
                  >
                    {relativeTime(user.lastLoginAt)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Never</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-sm text-muted-foreground">
                {user.activeSessions}
              </TableCell>
              {canManage ? (
                <TableCell className="text-right">
                  <UserRowActions
                    user={user}
                    actor={actor}
                    disabled={busy}
                    onBusyChange={setBusyId}
                  />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
