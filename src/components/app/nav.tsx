"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  FileUp,
  Gauge,
  History,
  LayoutList,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Capability } from "@/lib/auth/rbac";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  capability?: Capability;
  exact?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, exact: true },
  { href: "/registers", label: "Registers", icon: LayoutList, capability: "records:view" },
  { href: "/search", label: "Search", icon: Search, capability: "records:view" },
  { href: "/imports", label: "Imports", icon: FileUp, capability: "records:import" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/users", label: "Users", icon: Users, capability: "users:read" },
  { href: "/activity", label: "Activity", icon: History, capability: "activity:read" },
  { href: "/settings", label: "Settings", icon: Settings, capability: "settings:manage" },
];

export function NavLinks({
  items,
  can,
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  can: (capability?: Capability) => boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Workspace navigation">
      {items
        .filter((item) => can(item.capability))
        .map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
    </nav>
  );
}

export function BrandMark({ collapsed = false }: { collapsed?: boolean } = {}) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5"
      title={collapsed ? "Romeoville Archive" : undefined}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        RV
      </span>
      {collapsed ? null : (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">Romeoville</span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Archive</span>
        </span>
      )}
    </Link>
  );
}

export function RoleBadge({ role }: { role: keyof typeof ROLE_LABELS }) {
  return (
    <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {ROLE_LABELS[role]}
    </span>
  );
}

export { BookOpenText };
