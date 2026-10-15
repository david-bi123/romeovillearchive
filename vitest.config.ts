import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration (see node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md).
 *
 * The Next.js guide recommends `vite-tsconfig-paths` for the `@/*` alias; that
 * package is not installed here, so the alias is declared manually to keep the
 * install at zero new dependencies.
 *
 * - `globals: false` — every test imports describe/it/expect from `vitest`.
 * - node environment everywhere (no component rendering in this suite).
 * - integration tests are DB-guarded and skip when TEST_DATABASE_URL is unset.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    // Integration suites talk to a remote TiDB over TLS; round-trips alone can
    // take hundreds of milliseconds, so the ceiling is generous. Unit tests
    // still finish in milliseconds — this only caps hangs.
    testTimeout: 60_000,
    // beforeAll hooks (migrations, setup writes) may take longer than a test.
    hookTimeout: 30_000,
    // Integration suites share one TEST_DATABASE_URL: run files one at a time
    // so migration DDL can never race another suite's writes on a fresh DB.
    fileParallelism: false,
  },
});
