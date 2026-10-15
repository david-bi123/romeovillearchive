import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession, getRegisterAccess } from "@/lib/auth/guard";
import { getImportJobAction, listImportErrorsAction } from "@/server/actions/imports";
import { PageHeader } from "@/components/app/layout-primitives";
import { ImportStatusView } from "@/components/app/imports/import-status-view";

export const metadata: Metadata = { title: "Import job" };

export default async function ImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await requireSession();
  const { jobId } = await params;

  const job = await getImportJobAction(jobId);
  if (!job) notFound();

  let register: { id: string; name: string } | null = null;
  if (job.targetRegisterId) {
    const access = await getRegisterAccess(job.targetRegisterId, session);
    if (access) {
      register = { id: access.register.id, name: access.register.name };
    }
  }

  const errors = await listImportErrorsAction(jobId, 1000);

  return (
    <div>
      <PageHeader
        title={job.filename}
        description="Live status, counters and row-level errors for this import."
        breadcrumb={
          <Link href="/imports" className="hover:underline">
            Imports
          </Link>
        }
      />
      <div className="p-4 sm:p-6 lg:p-8">
        <ImportStatusView summary={job} register={register} errors={errors} />
      </div>
    </div>
  );
}
