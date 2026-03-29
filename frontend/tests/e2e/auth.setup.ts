/**
 * Auth Setup
 * Runs once before all tests. Authenticates and saves HttpOnly cookie state.
 * All subsequent tests reuse the saved auth state without re-logging in.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const AUTH_FILE = "tests/e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  // Ensure auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  await page.goto("/login");

  // Fill credentials
  await page.getByLabel("Email address").fill(
    process.env.TEST_USER_EMAIL || "test@pipeline-studio.dev"
  );
  await page.getByLabel("Password").fill(
    process.env.TEST_USER_PASSWORD || "TestPassword123"
  );

  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("/dashboard", { timeout: 10_000 });

  // Verify we're actually logged in
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();

  // Save cookie state — cookies are HttpOnly so Playwright captures them via CDP
  await page.context().storageState({ path: AUTH_FILE });

  console.log("[setup] Auth state saved to", AUTH_FILE);
});
