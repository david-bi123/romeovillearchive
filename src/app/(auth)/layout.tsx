import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="branded-backdrop flex min-h-full flex-col bg-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2.5"
          aria-label="Romeoville Archive home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-card">
            RV
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-tight text-foreground">
              Romeoville
            </span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Archive
            </span>
          </span>
        </Link>
        <div className="rounded-xl border border-border bg-surface shadow-raised">{children}</div>
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Document &amp; indenture management with registers, audit trails and
          role based access.
          <span className="mt-1 block">
            Staff accounts are invitation only ·{" "}
            <Link href="/forgot-password" className="underline hover:text-foreground">
              Need help signing in?
            </Link>
          </span>
        </p>
      </div>
    </div>
  );
}
