import { loadEnvFiles } from "./lib/load-env";

loadEnvFiles();

/**
 * Sends (or safely retries) the initial super administrator activation email.
 *
 *   npm run bootstrap            # send if nothing is pending
 *   npm run bootstrap -- --resend  # rotate the token and send again
 *
 * Requires BOOTSTRAP_SECRET in production; in development a built-in dev value
 * is used automatically. The script never prints the activation token.
 */
async function main(): Promise<void> {
  const resend = process.argv.includes("--resend");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !process.env.BOOTSTRAP_SECRET) {
    console.error("BOOTSTRAP_SECRET must be set in production.");
    process.exit(1);
  }

  const { triggerSuperAdminActivation } = await import("../src/server/bootstrap");
  const outcome = await triggerSuperAdminActivation({ resend, ip: "cli" });

  console.log(`status: ${outcome.status}`);
  console.log(outcome.message);
  if (outcome.status === "email_failed") process.exit(2);
}

main().catch((error) => {
  console.error("Bootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
