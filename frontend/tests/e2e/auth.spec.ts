import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } }); // unauthenticated

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle(/Pipeline Studio/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create one" })).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email address").fill("wrong@email.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Error message should appear
    await expect(page.locator('[role="alert"], .bg-danger-50')).toBeVisible({ timeout: 5_000 });
    // Should NOT redirect
    await expect(page).toHaveURL("/login");
  });

  test("required fields validation", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should not redirect on empty submit
    await expect(page).toHaveURL("/login");
  });

  test("redirects unauthenticated users from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("/login", { timeout: 5_000 });
    await expect(page).toHaveURL("/login");
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel(/Email address/)).toBeVisible();
    await expect(page.getByLabel(/Password/)).toBeVisible();
  });

  test("password strength indicator appears", async ({ page }) => {
    await page.goto("/register");

    const passwordInput = page.getByLabel(/Password/);
    await passwordInput.fill("weak");

    // Progress bar should be visible
    await expect(page.locator(".progress-track")).toBeVisible();
    await expect(page.getByText("Too short")).toBeVisible();

    await passwordInput.fill("StrongPassword123");
    await expect(page.getByText("Strong")).toBeVisible();
  });

  test("tokens are NOT accessible via localStorage (security test)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(
      process.env.TEST_USER_EMAIL || "test@pipeline-studio.dev"
    );
    await page.getByLabel("Password").fill(
      process.env.TEST_USER_PASSWORD || "TestPassword123"
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/dashboard", { timeout: 10_000 });

    // CRITICAL SECURITY ASSERTION:
    // Tokens must NOT be accessible from JavaScript (localStorage or sessionStorage)
    const accessToken  = await page.evaluate(() => localStorage.getItem("access_token"));
    const refreshToken = await page.evaluate(() => localStorage.getItem("refresh_token"));
    const sessionAT    = await page.evaluate(() => sessionStorage.getItem("access_token"));

    expect(accessToken,  "access_token must NOT be in localStorage").toBeNull();
    expect(refreshToken, "refresh_token must NOT be in localStorage").toBeNull();
    expect(sessionAT,    "access_token must NOT be in sessionStorage").toBeNull();

    console.log("✓ SECURITY: Tokens not accessible from JS context");
  });

  test("logout clears session", async ({ page }) => {
    // Start authenticated (uses saved state)
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");

    // Trigger logout via user menu
    await page.getByRole("button", { name: /User|user/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    // Should redirect to login
    await page.waitForURL("/login", { timeout: 5_000 });

    // Attempting to go back should redirect to login again
    await page.goto("/dashboard");
    await page.waitForURL("/login", { timeout: 5_000 });
    await expect(page).toHaveURL("/login");
  });

  test("keyboard navigation works on login form", async ({ page }) => {
    await page.goto("/login");

    // Tab through form elements
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Email address")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();

    await page.keyboard.press("Tab");
    // Toggle show/hide password button should be focusable
    // (tabIndex=-1 so skip to submit button)
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();

    // Enter should submit
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/login"); // stays (empty fields)
  });
});
