import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ActivateForm } from "@/components/app/activate-form";
import { inspectInvitationToken } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Activate account" };

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; kind?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return <InvalidToken message="This page only works when opened from an activation email." />;
  }

  // The activation page only ever completes a bootstrap (initial super admin)
  // invitation; staff invitations go through /accept-invitation.
  const inspection = await inspectInvitationToken(token, "bootstrap");
  if (!inspection.valid) {
    return <InvalidToken message={inspection.message} />;
  }

  return <ActivateForm token={token} email={inspection.email} />;
}

function InvalidToken({ message }: { message: string }) {
  return (
    <div className="space-y-4 p-6 sm:p-7">
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>This link cannot be used</AlertTitle>
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
