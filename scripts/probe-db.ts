import { loadEnvFiles } from "./lib/load-env";

loadEnvFiles();

async function main() {
  const { checkRateLimit } = await import("../src/lib/rate-limit");
  const { db } = await import("../src/lib/db");
  const { rateLimits } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { sql } = await import("drizzle-orm");

  const key = `probe2-${Date.now()}`;
  const bucket = `search:${key}`;
  const win = { limit: 3, windowMs: 3_000 };

  for (let i = 1; i <= 4; i++) {
    const r = await checkRateLimit("search", key, win);
    // raw read through drizzle execute (prepared), then drizzle select
    const raw = await db.execute(sql`SELECT count AS c, window_start AS ws FROM rate_limits WHERE bucket = ${bucket}`);
    const rows = await db.select().from(rateLimits).where(eq(rateLimits.bucket, bucket));
    console.log(
      `call ${i}: result.remaining=${r.remaining} raw=${JSON.stringify(raw[0])} select=${JSON.stringify(rows[0]?.count)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
