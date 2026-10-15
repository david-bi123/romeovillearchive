import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

export type Database = MySql2Database<typeof schema>;

declare global {
  var __romeovilleDb: Database | undefined;
  var __romeovillePool: mysql.Pool | undefined;
}

/**
 * Builds the mysql2 pool options from DATABASE_URL.
 *
 * TiDB Cloud Serverless requires TLS, plain local development instances do
 * not, so TLS is enabled automatically for any non-local host and can be
 * forced on/off through the `ssl` URL parameter or MYSQL_SSL_DISABLED.
 */
function createPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Copy .env.example to .env.local and point it at your TiDB Cloud database.",
    );
  }

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const sslParam = parsed.searchParams.get("ssl");

  let ssl: mysql.SslOptions | undefined;
  const disabled = process.env.MYSQL_SSL_DISABLED === "true" || sslParam === "false";
  const caPem = process.env.DATABASE_SSL_CA
    ? Buffer.from(process.env.DATABASE_SSL_CA, "base64").toString("utf8")
    : undefined;

  if (caPem) {
    ssl = { ca: caPem, rejectUnauthorized: true };
  } else if (!disabled && (!isLocal || sslParam === "true")) {
    ssl = { rejectUnauthorized: true };
  }

  return mysql.createPool({
    uri: url,
    ssl,
    waitForConnections: true,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    queueLimit: 0,
    connectTimeout: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 15000),
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    // Return DATETIME columns as JS Date objects.
    dateStrings: false,
    decimalNumbers: true,
    // Spreadsheet values are arbitrary text; never lose non-utf8 bytes.
    charset: "utf8mb4",
    multipleStatements: false,
  });
}

function createDatabase(): Database {
  const pool = globalThis.__romeovillePool ?? createPool();
  if (process.env.NODE_ENV !== "production") {
    globalThis.__romeovillePool = pool;
  }

  const db = drizzle(pool, { schema, mode: "default" });
  if (process.env.NODE_ENV !== "production") {
    globalThis.__romeovilleDb = db;
  }
  return db;
}

/**
 * Lazily created so that importing this module never throws at build time when
 * DATABASE_URL is absent (for example while `next build` collects page data).
 */
let cached: Database | undefined;

export function getDb(): Database {
  if (cached) return cached;
  cached = globalThis.__romeovilleDb ?? createDatabase();
  globalThis.__romeovilleDb = cached;
  return cached;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance as object, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
}) as Database;

export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    const pool = globalThis.__romeovillePool;
    if (!pool) {
      getDb();
    }
    await (globalThis.__romeovillePool as mysql.Pool).query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function closeDb(): Promise<void> {
  const pool = globalThis.__romeovillePool;
  cached = undefined;
  globalThis.__romeovilleDb = undefined;
  if (pool) {
    globalThis.__romeovillePool = undefined;
    await pool.end();
  }
}

export { schema };

/**
 * Drizzle's mysql2 `execute` returns `[rows, fields]` for result sets and a
 * result header for mutations. This normalizes both shapes to a row array so
 * raw SQL helpers stay type-safe at the call site.
 */
export async function rawRows<T = Record<string, unknown>>(
  query: import("drizzle-orm").SQL,
): Promise<T[]> {
  const result = (await getDb().execute(query)) as unknown;
  const first = Array.isArray(result) ? result[0] : result;
  if (Array.isArray(first)) return first as T[];
  return [];
}

/**
 * mysql2 reports mutations as a ResultSetHeader (either directly or as the
 * first element of `[header, fields]`). Drizzle types the whole result as
 * `MySqlRawQueryResult`, which does not expose `affectedRows`, so every
 * optimistic-concurrency / idempotency check goes through this helper.
 */
export function affectedCount(result: unknown): number {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (candidate && typeof candidate === "object" && "affectedRows" in candidate) {
    return Number((candidate as { affectedRows?: unknown }).affectedRows ?? 0);
  }
  return 0;
}

export async function rawAffected(query: import("drizzle-orm").SQL): Promise<number> {
  return affectedCount(await getDb().execute(query));
}

export async function rawCount(query: import("drizzle-orm").SQL): Promise<number> {
  const rows = await rawRows<{ count?: number | string | bigint }>(query);
  const value = rows[0]?.count;
  return value === undefined ? 0 : Number(value);
}
