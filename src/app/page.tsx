import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, FileUp, ShieldCheck, Table2 } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

const HIGHLIGHTS = [
  {
    icon: Table2,
    title: "Structured registers",
    description:
      "Purpose-built registers with custom columns replace scattered Excel files.",
  },
  {
    icon: FileUp,
    title: "Excel import & export",
    description:
      "Bring existing workbooks in safely with previews and validation, export any time.",
  },
  {
    icon: ShieldCheck,
    title: "Roles & audit trail",
    description:
      "Invitation-only access, role-based permissions and a full activity history.",
  },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-[var(--topbar-height)] w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              RV
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Romeoville
              </span>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Archive
              </span>
            </span>
          </span>
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto w-full max-w-2xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
            <Archive className="size-3.5" />
            Document &amp; Indenture Management System
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Romeoville Archive
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            The Document Department&apos;s central home for record registers —
            organised, searchable and secure, replacing the old Excel workflow.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/login">Sign in to your account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/forgot-password">Reset your password</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Staff accounts are invitation only. Ask your administrator for access.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <section
              key={item.title}
              className="rounded-lg border border-border bg-surface p-5 shadow-sm"
            >
              <item.icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-border">
        <p className="mx-auto w-full max-w-5xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          Romeoville Archive · Internal system for RomeoVille Properties staff.
        </p>
      </footer>
    </div>
  );
}
