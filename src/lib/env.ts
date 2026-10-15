import { z } from "zod";

/**
 * Central, lazily evaluated environment access.
 *
 * Values are read from process.env at call time (never bundled into client
 * code) and validated with zod so that a misconfigured deployment fails fast
 * with a clear message instead of behaving unpredictably in production.
 */

const nonEmpty = z.string().min(1, "%s is required");

const appBaseUrlSchema = z
  .string()
  .url("APP_BASE_URL must be a valid absolute URL, e.g. https://records.example.com");

export function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL;
  if (!raw) throw new Error("APP_BASE_URL is required (set it in Vercel project settings)");
  const parsed = appBaseUrlSchema.safeParse(raw.trim().replace(/\/+$/, ""));
  if (!parsed.success) throw new Error("APP_BASE_URL is invalid: " + parsed.error.message);
  return parsed.data;
}

/**
 * Builds an absolute URL from APP_BASE_URL, never from an untrusted request
 * Host header.
 */
export function absoluteUrl(path: string, searchParams?: Record<string, string>): string {
  const base = getAppBaseUrl();
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in .env.local (development) or the Vercel environment (production).",
    );
  }
  return url;
}

export const mailjetConfigSchema = z.object({
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
});

export type MailjetConfig = z.infer<typeof mailjetConfigSchema>;

export function getMailjetConfig(): MailjetConfig {
  const result = mailjetConfigSchema.safeParse({
    apiKey: process.env.MAILJET_API_KEY ?? "",
    apiSecret: process.env.MAILJET_API_SECRET ?? "",
    fromEmail: process.env.MAILJET_FROM_EMAIL ?? "",
    fromName: process.env.MAILJET_FROM_NAME ?? "RomeoVille Records",
  });
  if (!result.success) {
    throw new Error(
      "Mailjet is not configured. Set MAILJET_API_KEY, MAILJET_API_SECRET, MAILJET_FROM_EMAIL and MAILJET_FROM_NAME.",
    );
  }
  return result.data;
}

export function isMailjetConfigured(): boolean {
  return Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET);
}

export function getBootstrapSecret(): string | null {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (secret && secret.length >= 24) return secret;
  if (process.env.NODE_ENV !== "production") {
    // Development convenience only: allows `npm run bootstrap` to run locally
    // without extra setup. Never accepted in production.
    return "dev-only-bootstrap-secret";
  }
  return null;
}

export const initialSuperAdminEmail = (): string =>
  (process.env.INITIAL_SUPER_ADMIN_EMAIL ?? "indenturerecords@gmail.com").trim().toLowerCase();

export function getUploadLimits(): { maxUploadBytes: number; maxImportRows: number } {
  const mb = clamp(Number(process.env.MAX_UPLOAD_MB ?? 20), 1, 50);
  const rows = clamp(Number(process.env.MAX_IMPORT_ROWS ?? 20000), 1, 200000);
  return { maxUploadBytes: mb * 1024 * 1024, maxImportRows: rows };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const ENV_KEYS = [
  "DATABASE_URL",
  "APP_BASE_URL",
  "BOOTSTRAP_SECRET",
  "MAILJET_API_KEY",
  "MAILJET_API_SECRET",
  "MAILJET_FROM_EMAIL",
  "MAILJET_FROM_NAME",
  "INITIAL_SUPER_ADMIN_EMAIL",
  "MAX_UPLOAD_MB",
  "MAX_IMPORT_ROWS",
] as const;

export type EnvKey = (typeof ENV_KEYS)[number];

/** Reports which of the known environment keys are configured. Never leaks values. */
export function describeEnvironment(): Record<EnvKey, boolean> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, Boolean(process.env[key])])) as Record<
    EnvKey,
    boolean
  >;
}

export { nonEmpty };
