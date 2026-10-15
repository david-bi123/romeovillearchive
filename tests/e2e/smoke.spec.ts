import { expect, test } from "@playwright/test";

/**
 * Smoke tests for the deployed scaffold. Everything here must work without a
 * database or Mailjet account: `/` is static, unmatched routes 404, and the
 * bootstrap endpoint rejects anonymous callers before it touches storage.
 */
test.describe("smoke", () => {
  test("home page renders with template content", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle("Create Next App");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "To get started, edit the",
    );
    await expect(page.getByRole("link", { name: "Documentation" })).toBeVisible();
  });

  test("unknown routes return 404", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-route");
    expect(response?.status()).toBe(404);
  });

  test("login route skips until the auth screens land", async ({ page }) => {
    const response = await page.goto("/login");
    test.skip(
      response?.status() === 404,
      "no /login route in this scaffold — extend this test when auth screens exist",
    );

    expect(response?.status()).toBe(200);
    await expect(page.locator("form input").first()).toBeVisible();

    // Optional sign-in flow for environments that provide credentials.
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    test.skip(!email || !password, "set E2E_EMAIL and E2E_PASSWORD to exercise sign-in");
    await page.locator('input[type="email"], input[name*="email" i]').first().fill(email!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.locator('button[type="submit"]').first().click();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("bootstrap API requires the shared secret", async ({ request }) => {
    const response = await request.get("/api/bootstrap");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("bootstrap API rejects cross-origin callers", async ({ request }) => {
    const response = await request.post("/api/bootstrap", {
      headers: { origin: "http://evil.example" },
      data: {},
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "Cross-origin request rejected" });
  });
});
