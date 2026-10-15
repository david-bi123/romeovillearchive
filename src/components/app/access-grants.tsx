"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, isRole } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";
import { setRegisterGrantAction } from "@/server/actions/registers";
import type { ActionState } from "@/server/actions/shared";

const PERMISSIONS = [
  { key: "canView", label: "View" },
  { key: "canCreate", label: "Create" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
  { key: "canImport", label: "Import" },
  { key: "canExport", label: "Export" },
] as const;

type PermissionKey = (typeof PERMISSIONS)[number]["key"];

type GrantRow = {
  targetType: "role" | "user";
  targetId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canImport: boolean;
  canExport: boolean;
};

type UserOption = { id: string; fullName: string | null; email: string };

const ROLE_TARGETS: Role[] = ["viewer", "editor", "admin"];

function labelFor(row: GrantRow, users: UserOption[]): string {
  if (row.targetType === "role") {
    return isRole(row.targetId) ? ROLE_LABELS[row.targetId] : row.targetId;
  }
  const user = users.find((option) => option.id === row.targetId);
  return user ? (user.fullName || user.email) : row.targetId;
}

function GrantEditor({
  registerId,
  row,
  label,
  users,
}: {
  registerId: string;
  row: GrantRow;
  label: string;
  users: UserOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<PermissionKey, boolean>>({
    canView: row.canView,
    canCreate: row.canCreate,
    canEdit: row.canEdit,
    canDelete: row.canDelete,
    canImport: row.canImport,
    canExport: row.canExport,
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty = PERMISSIONS.some((permission) => values[permission.key] !== row[permission.key]);

  const save = () => {
    startTransition(async () => {
      const state: ActionState = await setRegisterGrantAction({
        registerId,
        grant: {
          targetType: row.targetType,
          targetId: row.targetId,
          canView: values.canView,
          canCreate: values.canCreate,
          canEdit: values.canEdit,
          canDelete: values.canDelete,
          canImport: values.canImport,
          canExport: values.canExport,
        },
      });
      if (state.ok) {
        toast.success(`Access saved for ${label}.`);
        setSaved(true);
        router.refresh();
      } else {
        toast.error(state.message ?? "Could not save access.");
      }
    });
  };

  void users;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border bg-surface px-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {PERMISSIONS.map((permission) => (
          <label
            key={permission.key}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Checkbox
              checked={values[permission.key]}
              disabled={pending}
              onCheckedChange={(next) => {
                setSaved(false);
                setValues({ ...values, [permission.key]: next === true });
              }}
            />
            {permission.label}
          </label>
        ))}
      </div>
      <Button
        size="sm"
        variant={dirty ? "default" : "ghost"}
        disabled={pending || !dirty}
        onClick={save}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
        {dirty ? "Save" : "Saved"}
      </Button>
    </div>
  );
}

export function AccessGrants({
  registerId,
  grants,
  users,
}: {
  registerId: string;
  grants: GrantRow[];
  users: UserOption[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [pickedUser, setPickedUser] = useState("");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const roleRows = ROLE_TARGETS.map((role) => {
    const existing = grants.find((grant) => grant.targetType === "role" && grant.targetId === role);
    return (
      existing ?? {
        targetType: "role" as const,
        targetId: role,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canImport: false,
        canExport: false,
      }
    );
  });

  const userGrants = grants.filter((grant) => grant.targetType === "user");
  const ungrantedUsers = users.filter(
    (user) => !userGrants.some((grant) => grant.targetId === user.id),
  );

  const addGrant = () => {
    if (!pickedUser) return;
    startTransition(async () => {
      const state = await setRegisterGrantAction({
        registerId,
        grant: {
          targetType: "user",
          targetId: pickedUser,
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canImport: false,
          canExport: false,
        },
      });
      if (state.ok) {
        toast.success("User override added — adjust its permissions below.");
        setAddOpen(false);
        setPickedUser("");
        router.refresh();
      } else {
        toast.error(state.message ?? "Could not add override.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Role defaults</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everyone with a role gets these permissions on this register. A user-specific override
          below always wins.
        </p>
        <div className="mt-3 space-y-2">
          {roleRows.map((row) => (
            <GrantEditor
              key={row.targetId}
              registerId={registerId}
              row={row}
              label={labelFor(row, users)}
              users={users}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            <Badge variant="secondary" className="mr-1">
              Super administrator
            </Badge>
            always has full access and is not listed.
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">User overrides</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Individual staff granted (or denied) access to this register only.
            </p>
          </div>
          {ungrantedUsers.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" />
              Add override
            </Button>
          ) : null}
        </div>
        <div className="mt-3 space-y-2">
          {userGrants.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No user overrides.
            </p>
          ) : (
            userGrants.map((row) => (
              <GrantEditor
                key={`${row.targetType}:${row.targetId}`}
                registerId={registerId}
                row={row}
                label={labelFor(row, users)}
                users={users}
              />
            ))
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user override</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Staff member</Label>
            <Select value={pickedUser} onValueChange={setPickedUser}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a staff member" />
              </SelectTrigger>
              <SelectContent>
                {ungrantedUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addGrant} disabled={pending || !pickedUser}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Add with view access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
