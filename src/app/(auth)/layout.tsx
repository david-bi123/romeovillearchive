import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            RV
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            RomeoVille Records
          </span>
        </Link>
        <div className="rounded-lg border border-border bg-surface shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Document &amp; indenture management with registers, audit trails and role based access.
        </p>
      </div>
    </div>
  );
}
