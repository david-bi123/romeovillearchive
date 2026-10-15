import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { InvitationListItem } from "@/server/actions/users";
import { InvitationActions } from "@/components/app/users/invitation-actions";

function expiryText(expiresAt: Date): string {
  const diffMs = expiresAt.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60_000);
  const abs =
    absMinutes >= 1440
      ? `${Math.round(absMinutes / 1440)}d`
      : absMinutes >= 60
        ? `${Math.round(absMinutes / 60)}h`
        : `${absMinutes}m`;
  return diffMs > 0 ? `in ${abs}` : `${abs} ago`;
}

function isExpiringSoon(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() < 12 * 60 * 60 * 1000;
}

const STATE_BADGE: Record<
  InvitationListItem["displayState"],
  { label: string; variant: "success" | "warning" | "secondary" | "destructive" }
> = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  expired: { label: "Expired", variant: "secondary" },
  revoked: { label: "Revoked", variant: "destructive" },
};

export function InvitationsTable({
  invitations,
  canManage,
}: {
  invitations: InvitationListItem[];
  canManage: boolean;
}) {
  if (invitations.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No invitations yet. Use Invite teammate to grant someone access.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invitee</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Invited by</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          {canManage ? <TableHead className="w-28 text-right">Actions</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => {
          const state = STATE_BADGE[invitation.displayState];
          const isPending = invitation.displayState === "pending";
          const expiredSoon = isPending && isExpiringSoon(invitation.expiresAt);
          return (
            <TableRow key={invitation.id}>
              <TableCell className="max-w-56">
                <p className="truncate text-sm font-medium">{invitation.email}</p>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{invitation.role}</Badge>
              </TableCell>
              <TableCell className="max-w-40">
                <p className="truncate text-sm text-muted-foreground">
                  {invitation.invitedByName ?? "Unknown"}
                </p>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(invitation.createdAt)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <span title={formatDate(invitation.expiresAt, true)}>
                  {isPending ? expiryText(invitation.expiresAt) : "—"}
                </span>
                {expiredSoon ? (
                  <Badge variant="warning" className="ml-2 align-middle">
                    Soon
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                <Badge variant={state.variant}>{state.label}</Badge>
              </TableCell>
              {canManage ? (
                <TableCell>
                  <InvitationActions
                    invitationId={invitation.id}
                    email={invitation.email}
                    expired={!isPending}
                    disabled={false}
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
