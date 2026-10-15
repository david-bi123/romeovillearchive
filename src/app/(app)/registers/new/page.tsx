import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireCapability } from "@/lib/auth/guard";
import { PageHeader } from "@/components/app/layout-primitives";
import { RegisterForm } from "@/components/app/register-form";

export const metadata: Metadata = { title: "New register" };

export default async function NewRegisterPage() {
  await requireCapability("registers:create");

  return (
    <div>
      <PageHeader
        title="New register"
        description="Name it, open a fresh sheet, then type your column names and rows straight into the table."
        breadcrumb={
          <Link href="/registers" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-3.5" />
            Registers
          </Link>
        }
      />
      <div className="max-w-xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
          <RegisterForm />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Prefer to start from a file? You can also import an Excel workbook — its
          columns become the register columns.{" "}
          <Link href="/imports/new" className="underline hover:text-foreground">
            Go to imports
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
