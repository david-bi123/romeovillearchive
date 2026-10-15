"use client";

import Link from "next/link";
import { useState } from "react";
import { FileUp, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandMark, NavLinks, PRIMARY_NAV, SECONDARY_NAV } from "@/components/app/nav";
import { UserMenu } from "@/components/app/user-menu";
import { roleCapabilities, type Capability } from "@/lib/auth/rbac";
import type { Role } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "rv-sidebar-collapsed";

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Client shell for the authenticated area: collapsible fixed sidebar on large
 * screens, a sheet drawer on small ones, plus the sticky top bar. Children
 * are the server rendered page content.
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
  const [collapsed, setCollapsed] = useState<boolean>(() => readStoredCollapsed());
  const capabilities = roleCapabilities(role);
  const can = (capability?: Capability) => !capability || capabilities.includes(capability);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // Private browsing: the toggle still works for this page load.
      }
      return next;
    });
  };

  const nav = (iconOnly: boolean) => (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
      <div className="space-y-1">
        {iconOnly ? null : (
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
        )}
        <NavLinks items={PRIMARY_NAV} can={can} onNavigate={() => setOpen(false)} collapsed={iconOnly} />
      </div>
      {SECONDARY_NAV.some((item) => can(item.capability)) ? (
        <div className="space-y-1">
          {iconOnly ? null : (
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Administration
            </p>
          )}
          <NavLinks items={SECONDARY_NAV} can={can} onNavigate={() => setOpen(false)} collapsed={iconOnly} />
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
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-[var(--sidebar-width)]",
        )}
      >
        <div className="flex h-[var(--topbar-height)] items-center justify-between gap-1 border-b border-border px-3">
          <BrandMark collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
        {nav(collapsed)}
        <div className="border-t border-border p-3">
          {collapsed ? (
            <Button asChild variant="outline" size="icon" className="w-full" title="New register">
              <Link href="/registers/new" aria-label="New register">
                <FileUp className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
              <Link href="/registers/new">
                <FileUp className="size-4" />
                New register
              </Link>
            </Button>
          )}
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            "flex min-h-screen flex-col",
            collapsed ? "lg:pl-16" : "lg:pl-[var(--sidebar-width)]",
          )}
        >
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
          {nav(false)}
        </SheetContent>
      </Sheet>
    </div>
  );
}
