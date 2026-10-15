import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Slugifies a register name into a stable, URL safe identifier.
 * Always produces a non-empty result and appends a suffix on collision
 * resolution performed by the caller.
 */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "register";
}

/**
 * Normalizes a display column name into a stable internal field key.
 * Reserved keys are rejected by the caller.
 */
export function fieldKeyFrom(name: string, taken: Set<string>): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  const stem = base || "field";
  if (!taken.has(stem)) return stem;
  let suffix = 2;
  while (taken.has(`${stem}_${suffix}`)) suffix += 1;
  return `${stem}_${suffix}`;
}

export const RESERVED_FIELD_KEYS = new Set([
  "id",
  "record_id",
  "recordid",
  "serial",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "createdat",
  "updatedat",
  "status_id",
  "__proto__",
  "constructor",
  "prototype",
]);

export function isReservedFieldKey(key: string): boolean {
  return RESERVED_FIELD_KEYS.has(key.toLowerCase());
}

/** Trims and collapses whitespace in a user-supplied display string. */
export function cleanText(input: unknown, max = 4000): string {
  if (input === null || input === undefined) return "";
  return String(input).replace(/\r\n/g, "\n").trim().slice(0, max);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

export function formatDate(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
  }).format(date);
}

export function relativeTime(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - value.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function titleCase(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Safe filename component for downloads (avoids traversal and shell chars). */
export function safeFilename(input: string, extension: string): string {
  const stem = input
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9 _.-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/[.-]+$/g, "");
  return `${stem || "export"}${extension.startsWith(".") ? extension : `.${extension}`}`;
}

export function truncate(input: string, max: number): string {
  return input.length <= max ? input : `${input.slice(0, max - 1)}…`;
}
