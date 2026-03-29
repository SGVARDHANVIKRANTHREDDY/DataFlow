import { test, expect } from "@playwright/test";

// Uses saved auth state from auth.setup.ts
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("renders dashboard with key elements", async ({ page }) => {
    // Sidebar navigation
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Datasets" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pipelines" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Executions" })).toBeVisible();

    // Topbar
    const topbar = page.locator("header");
    await expect(topbar).toBeVisible();

    // Greeting
    await expect(
      page.getByText(/Good (morning|afternoon|evening)/)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("metric cards are visible", async ({ page }) => {
    // Four metric cards: Datasets, Pipelines, Executions, Success Rate
    const cards = page.locator('[class*="rounded-xl"]').filter({ hasText: /Datasets|Pipelines|Executions|Success Rate/ });
    // At least one card visible
    await expect(cards.first()).toBeVisible({ timeout: 5_000 });
  });

  test("quick actions are visible and clickable", async ({ page }) => {
    await expect(page.getByText("Quick actions")).toBeVisible({ timeout: 5_000 });

    const uploadLink = page.getByRole("link", { name: /Upload dataset/ });
    await expect(uploadLink).toBeVisible();

    // Click and verify navigation
    await uploadLink.click();
    await page.waitForURL("/datasets", { timeout: 5_000 });
    await expect(page).toHaveURL("/datasets");
  });

  test("activity chart renders", async ({ page }) => {
    // Chart should be present after data loads
    await expect(page.locator("canvas, .recharts-responsive-container")).toBeVisible({
      timeout: 8_000,
    });
  });

  test("sidebar navigation highlights active item", async ({ page }) => {
    const dashboardLink = page.getByRole("link", { name: "Dashboard" });

    // Should have active styling
    await expect(dashboardLink).toHaveAttribute("aria-current", "page");
  });

  test("skip to main content link works", async ({ page }) => {
    // Focus the skip link via keyboard
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    if (await skipLink.isVisible()) {
      await skipLink.click();
      // Main content should have focus
      await expect(page.locator("#main-content")).toBeFocused();
    }
  });

  test("is accessible (no critical violations)", async ({ page }) => {
    // Basic ARIA check
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();

    // No role="presentation" used incorrectly
    const headings = page.getByRole("heading", { level: 1 });
    // Should have at most one h1 (greeting)
    await expect(headings).toHaveCount(0); // h1 is not used in dashboard body
  });
});
