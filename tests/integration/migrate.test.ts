import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { beforeAll, expect, it } from "vitest";
import { getDb, rawCount, rawRows } from "@/lib/db";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { describeWithDb } from "./helpers/db";

/**
 * Applies the real migration folder (the same logic as scripts/migrate.ts)
 * and checks that every application table exists. Migration is idempotent —
 * the drizzle journal table prevents re-applying SQL on later runs.
 */
describeWithDb("database migrations", () => {
  beforeAll(
    async () => {
      const migrationsFolder = fileURLToPath(new URL("../../drizzle/migrations", import.meta.url));
      const db = getDb();
      await migrate(db, { migrationsFolder });
      // Second run proves idempotency (the journal skips applied entries).
      await migrate(db, { migrationsFolder });
    },
    60_000,
  );

  it("creates every application table", async () => {
    const tables = [
      "users",
      "sessions",
      "password_reset_tokens",
      "invitations",
      "registers",
      "register_fields",
      "records",
      "record_values",
      "register_views",
      "register_access",
      "import_jobs",
      "import_chunks",
      "import_errors",
      "audit_logs",
      "settings",
      "rate_limits",
    ];
    for (const table of tables) {
      const count = await rawCount(
        sql`SELECT COUNT(*) AS count FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = ${table}`,
      );
      expect(count, `table ${table} should exist`).toBe(1);
    }
  });

  it("gives core tables their key columns and unique indexes", async () => {
    const emailCols = await rawCount(
      sql`SELECT COUNT(*) AS count FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email'`,
    );
    expect(emailCols).toBe(1);

    const indexes = await rawRows<{ index_name: string }>(
      sql`SELECT index_name FROM information_schema.statistics
          WHERE table_schema = DATABASE() AND table_name = 'records'`,
    );
    const indexNames = new Set(indexes.map((row) => row.index_name));
    expect(indexNames.has("records_register_serial_unique")).toBe(true);
  });
});
