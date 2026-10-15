import { loadEnvFiles } from "./lib/load-env";

loadEnvFiles();

/**
 * Controlled migration runner.
 *
 * Migrations are NEVER applied automatically at application startup — run this
 * command deliberately (locally or as a release step) so destructive changes
 * cannot slip in unreviewed:
 *
 *   npm run db:migrate
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Configure .env.local or the Vercel environment first.");
    process.exit(1);
  }

  const { drizzle } = await import("drizzle-orm/mysql2");
  const { migrate } = await import("drizzle-orm/mysql2/migrator");
  const { default: mysql } = await import("mysql2/promise");

  const parsed = new URL(url);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const ssl =
    process.env.MYSQL_SSL_DISABLED === "true"
      ? undefined
      : process.env.DATABASE_SSL_CA
        ? { ca: Buffer.from(process.env.DATABASE_SSL_CA, "base64").toString("utf8"), rejectUnauthorized: true }
        : !isLocal || parsed.searchParams.get("ssl") === "true"
          ? { rejectUnauthorized: true }
          : undefined;

  const pool = mysql.createPool({ uri: url, ssl, connectionLimit: 2, waitForConnections: true });
  const db = drizzle(pool);

  console.log(`Applying migrations to ${parsed.hostname}/${parsed.pathname.slice(1)} ...`);
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Migrations applied successfully.");

  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
