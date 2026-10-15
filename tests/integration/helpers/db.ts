import { fileURLToPath } from "node:url";
import { beforeAll, describe } from "vitest";
import { loadEnvFiles } from "../../../scripts/lib/load-env";

/**
 * Database guard for integration tests.
 *
 * There is no guarantee a database is reachable in CI or on a developer
 * machine, so every suite that needs one goes through `describeWithDb` and
 * skips cleanly (with a printed reason) when TEST_DATABASE_URL is unset.
 *
 * Env loading mirrors the CLI scripts: .env.local then .env, never
 * overwriting an already-set variable (see scripts/lib/load-env.ts).
 */
loadEnvFiles();

if (process.env.TEST_DATABASE_URL) {
  // Route every query — including the app's own `db` singleton — at the test
  // database, so a developer's .env DATABASE_URL can never be written to.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export const hasDb = Boolean(process.env.TEST_DATABASE_URL);

if (!hasDb && !(globalThis as { __rvSkipReasonPrinted?: boolean }).__rvSkipReasonPrinted) {
  (globalThis as { __rvSkipReasonPrinted?: boolean }).__rvSkipReasonPrinted = true;
  console.log("[integration] skipped: no TEST_DATABASE_URL");
}

/**
 * Applies drizzle/migrations once per worker process. Registered as a beforeAll
 * inside every `describeWithDb` block, so any DB suite works against a brand
 * new TEST_DATABASE_URL regardless of file execution order; the journal table
 * makes repeat runs cheap no-ops. The dedicated migrate suite additionally
 * proves idempotency by calling `migrate()` itself.
 */
export async function ensureMigrated(): Promise<void> {
  if (!hasDb) return;
  const state = globalThis as { __rvMigrated?: Promise<void> };
  state.__rvMigrated ??= (async () => {
    const { getDb } = await import("@/lib/db");
    const { migrate } = await import("drizzle-orm/mysql2/migrator");
    const migrationsFolder = fileURLToPath(new URL("../../../drizzle/migrations", import.meta.url));
    await migrate(getDb(), { migrationsFolder });
  })();
  await state.__rvMigrated;
}

/**
 * `describe.skipIf(!hasDb)` — the suite body is collected but hooks/tests
 * never run without a database, so nothing here can fail the suite for a
 * missing DB. With a database present, migrations are ensured first.
 */
export function describeWithDb(name: string, factory: () => void): void {
  describe.skipIf(!hasDb)(name, () => {
    if (hasDb) {
      beforeAll(() => ensureMigrated(), 60_000);
    }
    factory();
  });
}

/** Fresh identifier for idempotent, independently-cleaning-up test data. */
export function uniqueId(): string {
  return crypto.randomUUID();
}
