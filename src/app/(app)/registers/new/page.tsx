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
        description="Define the columns first — records you add or import afterwards follow this schema."
        breadcrumb={
          <Link href="/registers" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-3.5" />
            Registers
          </Link>
        }
      />
      <div className="max-w-3xl p-4 sm:p-6 lg:p-8">
        <RegisterForm />
      </div>
    </div>
  );
}
