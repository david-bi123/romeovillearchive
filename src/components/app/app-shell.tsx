"use client";

import Link from "next/link";
import { useState } from "react";
import { FileUp, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandMark, NavLinks, PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav";
import { UserMenu } from "@/components/app/user-menu";
import { roleCapabilities, type Capability } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";

/**
 * Client shell for the authenticated area: fixed sidebar on large screens, a
 * sheet on small ones, plus the sticky top bar. Children are the server
 * rendered page content.
 */
export function AppShell({
  role,
  user,
  children,
}: {
  role: Role;
  user: { fullName: string | null; email: string; role: Role };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const capabilities = roleCapabilities(role);
  const can = (capability?: Capability) => !capability || capabilities.includes(capability);

  const nav = (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
      <div className="space-y-1">
        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <NavLinks items={PRIMARY_NAV} can={can} onNavigate={() => setOpen(false)} />
      </div>
      {SECONDARY_NAV.some((item) => can(item.capability)) ? (
        <div className="space-y-1">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          <NavLinks items={SECONDARY_NAV} can={can} onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-full bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-[var(--topbar-height)] items-center border-b border-border px-4">
          <BrandMark />
        </div>
        {nav}
        <div className="border-t border-border p-3">
          <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
            <Link href="/registers/new">
              <FileUp className="size-4" />
              New register
            </Link>
          </Button>
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <div className="flex min-h-screen flex-col lg:pl-[var(--sidebar-width)]">
          <header className="sticky top-0 z-20 flex h-[var(--topbar-height)] items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </SheetTrigger>
            <div className="lg:hidden">
              <BrandMark />
            </div>
            <div className="flex-1" />
            <UserMenu user={user} />
          </header>
          <main id="main-content" className="mx-auto w-full max-w-[88rem] flex-1">{children}</main>
        </div>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="flex h-[var(--topbar-height)] flex-row items-center justify-between border-b border-border px-4">
            <SheetTitle asChild>
              <BrandMark />
            </SheetTitle>
          </SheetHeader>
          {nav}
        </SheetContent>
      </Sheet>
    </div>
  );
}
