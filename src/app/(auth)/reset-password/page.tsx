import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResetPasswordForm } from "@/components/app/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="space-y-4 p-6 sm:p-7">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Missing token</AlertTitle>
          <AlertDescription>
            This page only works when opened from a reset link.{" "}
            <Link href="/forgot-password" className="underline">
              Request a new link
            </Link>
            .
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
