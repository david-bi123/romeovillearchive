import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AcceptInvitationForm } from "@/components/app/accept-invitation-form";
import { inspectInvitationToken } from "@/server/actions/auth";
import { ROLE_LABELS } from "@/lib/auth/rbac";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return <InvalidToken message="This page only works when opened from an invitation email." />;
  }

  const inspection = await inspectInvitationToken(token, "invitation");
  if (!inspection.valid) {
    return <InvalidToken message={inspection.message} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3 sm:px-7">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          You were invited as
        </span>
        <Badge variant="secondary">{ROLE_LABELS[inspection.role]}</Badge>
      </div>
      <AcceptInvitationForm
        token={token}
        email={inspection.email}
        fullName={inspection.fullName}
        message={inspection.message}
      />
    </div>
  );
}

function InvalidToken({ message }: { message: string }) {
  return (
    <div className="space-y-4 p-6 sm:p-7">
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>This invitation cannot be used</AlertTitle>
        <AlertDescription>
          {message}{" "}
          <Link href="/login" className="underline">
            Go to sign in
          </Link>
          .
        </AlertDescription>
      </Alert>
    </div>
  );
}
