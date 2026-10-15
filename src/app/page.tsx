import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  LayoutGrid,
  Lock,
  Search,
  ShieldCheck,
  Table2,
  Users,
} from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LandingNav } from "@/components/app/landing-nav";

/** Static, illustrative preview of the register interface. */
function ProductPreview() {
  const columns = ["Client Name", "Indenture No.", "Plot No.", "Date Received", "Status"];
  const rows: { cells: string[]; status: "success" | "secondary" | "warning"; badge: string }[] = [
    { cells: ["A. Mensah", "IND-1042", "PL-88", "12 Mar 2025", "Completed"], status: "success", badge: "Completed" },
    { cells: ["K. Owusu", "IND-1043", "PL-91", "28 Mar 2025", "In progress"], status: "warning", badge: "In progress" },
    { cells: ["E. Adeyemi", "IND-1044", "PL-102", "04 Apr 2025", "Ready"], status: "secondary", badge: "Ready" },
  ];
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface shadow-raised">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 hidden rounded-md border border-border bg-surface px-3 py-1 text-xs text-muted-foreground sm:block">
          Indentures in Progress
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5" aria-hidden>
        <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
          Table
        </span>
        <span className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Cards
        </span>
        <span className="ml-auto hidden rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground sm:block">
          Search records…
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                S/N
              </th>
              {columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.cells[1]} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">#{index + 1}</td>
                {row.cells.map((cell) => (
                  <td key={cell} className="whitespace-nowrap px-4 py-2.5 text-foreground">
                    {cell}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Badge variant={row.status}>{row.badge}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="border-t border-border bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground">
        Interface preview — the Documents register with table and card views
      </figcaption>
    </figure>
  );
}

const CAPABILITIES = [
  "Custom registers with typed columns",
  "Excel import with validation & previews",
  "Table and card views with search & filters",
  "Role-based access and full audit trail",
];

const STEPS = [
  {
    title: "Create a register",
    description:
      "Define a register such as “Documents Completed” and add the columns your team actually uses — text, dates, numbers, selects and more.",
  },
  {
    title: "Import or enter records",
    description:
      "Upload existing Excel workbooks through a guided wizard with mapping, previews and error reports — or add records by hand.",
  },
  {
    title: "Search, export and audit",
    description:
      "Find anything with global search and filters, export to Excel or CSV, and rely on the audit log for accountability.",
  },
];

const FAQS = [
  {
    question: "How do staff members get accounts?",
    answer:
      "Accounts are invitation only — there is no public signup. An administrator sends an invitation by email, and the new member sets their own password through a secure, single-use link.",
  },
  {
    question: "Can we bring in our existing Excel files?",
    answer:
      "Yes. The import wizard walks you through uploading a workbook, choosing a worksheet, mapping columns to register fields, previewing the data and reviewing validation errors before anything is saved. Existing records are never silently overwritten.",
  },
  {
    question: "Who can see or change records?",
    answer:
      "Access is controlled by roles — super administrator, administrator, editor and viewer — plus per-register permissions. Every check is enforced on the server, and exports require explicit permission.",
  },
  {
    question: "What happens when a record is deleted?",
    answer:
      "Records are archived rather than destroyed, so they stay searchable and can be restored. Permanent deletion of registers requires the highest permission and an explicit confirmation.",
  },
  {
    question: "Is our activity tracked?",
    answer:
      "Yes. Sign-ins, invitations, register and field changes, record edits, imports, exports and settings changes are all written to a tamper-resistant audit log that administrators can search.",
  },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-full flex-col bg-background">
      <LandingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="branded-backdrop border-b border-border">
          <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pt-16">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-card">
                <Archive className="size-3.5 text-primary" />
                Document &amp; Indenture Management System
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Every property document, finally in one trusted place
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
                Romeoville Archive replaces scattered Excel files with structured
                registers, safe spreadsheet imports and a complete audit trail —
                built for the Document Department&apos;s daily work.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/login">
                    Sign in to your account
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#how-it-works">See how it works</Link>
                </Button>
              </div>
              <ul className="mx-auto mt-8 grid max-w-2xl gap-x-6 gap-y-2 text-left text-sm text-muted-foreground sm:grid-cols-2">
                {CAPABILITIES.map((capability) => (
                  <li key={capability} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    <span>{capability}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mx-auto mt-10 max-w-5xl">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* Features — varied bento layout */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Features
            </p>
            <h2 className="mt-2 max-w-2xl text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Purpose-built for document and indenture records
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Everything the department does with spreadsheets today — creating
              registers, entering data, finding documents — with the safety and
              structure a real system provides.
            </p>

            <div className="mt-8 grid gap-4 lg:grid-cols-5">
              <article className="rounded-xl border border-border bg-surface p-6 shadow-card lg:col-span-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Table2 className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Registers with columns you define
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Create registers like Documents Completed or Indentures in
                  Progress, then define your own columns — client names,
                  indenture numbers, plot numbers, dates, statuses and remarks —
                  with proper types and validation on every value.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
                  {["Text", "Date", "Number", "Select", "Email", "Phone", "URL", "Boolean"].map(
                    (type) => (
                      <span
                        key={type}
                        className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                      >
                        {type}
                      </span>
                    ),
                  )}
                </div>
              </article>

              <article className="rounded-xl border border-border bg-surface p-6 shadow-card lg:col-span-2">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Excel import you can trust
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  A guided wizard handles worksheet selection, column mapping,
                  type detection, previews and row-by-row error reports — with
                  duplicate detection that never overwrites silently.
                </p>
              </article>

              <article className="rounded-xl border border-border bg-surface p-6 shadow-card lg:col-span-2">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <LayoutGrid className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Table and card views
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Work spreadsheet-style with sorting, filtering and bulk
                  actions, or switch to cards with status badges. Both views
                  share the same live records, search and pagination.
                </p>
              </article>

              <article className="rounded-xl border border-border bg-surface p-6 shadow-card lg:col-span-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Search className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Search everything, export anything
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  One permission-aware search across every register and record,
                  with filters, date ranges and sorting. Export the current view
                  or selected rows to Excel or CSV — guarded against spreadsheet
                  formula injection.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works — numbered steps */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              How it works
            </p>
            <h2 className="mt-2 max-w-2xl text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              From scattered files to a working archive in three steps
            </h2>
            <ol className="mt-8 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="relative">
                  <p
                    className="text-4xl font-semibold tabular-nums text-primary/25"
                    aria-hidden
                  >
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Security — split layout */}
        <section id="security" className="scroll-mt-20">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Security &amp; accountability
              </p>
              <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Company records deserve company-grade protection
              </h2>
              <p className="mt-3 text-muted-foreground">
                Access is invitation only and every meaningful action is written
                to a tamper-resistant audit log — who did what, when, and to
                which record.
              </p>
              <Button asChild className="mt-6">
                <Link href="/login">
                  <KeyRound className="size-4" />
                  Sign in securely
                </Link>
              </Button>
            </div>
            <ul className="space-y-3">
              {[
                {
                  icon: Users,
                  title: "Invitation-only accounts",
                  description: "No public signup. Every account is created by an administrator and activated through a single-use link.",
                },
                {
                  icon: Lock,
                  title: "Roles enforced on the server",
                  description: "Super admin, admin, editor and viewer roles — plus per-register permissions — checked on every operation.",
                },
                {
                  icon: ShieldCheck,
                  title: "Secure credentials & sessions",
                  description: "Argon2id password hashing, hashed single-use tokens, expiring database-backed sessions revoked on disable.",
                },
                {
                  icon: FileUp,
                  title: "Safe data handling",
                  description: "Archiving instead of destructive deletes, optimistic concurrency on edits, and documented backup guidance.",
                },
              ].map((item) => (
                <li
                  key={item.title}
                  className="flex gap-3.5 rounded-xl border border-border bg-surface p-4 shadow-card"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <item.icon className="size-4.5" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              FAQ
            </p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Questions staff usually ask
            </h2>
            <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-background px-5 sm:px-6">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {faq.question}
                      <ArrowRight
                        className="size-4 shrink-0 rotate-90 text-muted-foreground transition-transform group-open:-rotate-90"
                        aria-hidden
                      />
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="branded-backdrop border-t border-border">
          <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-20">
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Ready to work from the archive?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Staff members sign in with their invitation-activated accounts.
              New to the team? Ask your administrator for an invitation.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/login">
                  Sign in
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/forgot-password">Recover access</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left">
          <span className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              RV
            </span>
            <span className="text-sm font-semibold text-foreground">Romeoville Archive</span>
          </span>
          <p className="text-xs text-muted-foreground">
            Internal system for RomeoVille Properties staff · Invitation-only access
          </p>
          <span className="flex gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/forgot-password">Support</Link>
            </Button>
          </span>
        </div>
      </footer>
    </div>
  );
}
