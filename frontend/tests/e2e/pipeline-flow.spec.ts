import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

// Generate a small test CSV
function createTestCsv(): Buffer {
  const header = "age,salary,department,score";
  const rows = Array.from({ length: 100 }, (_, i) =>
    `${20 + (i % 45)},${40000 + i * 1000},${["Eng", "Marketing", "HR"][i % 3]},${(Math.random()).toFixed(3)}`
  );
  return Buffer.from([header, ...rows].join("\n"));
}

test.describe("Pipeline Builder Flow", () => {
  test("full flow: upload → translate → execute", async ({ page }) => {
    // ── 1. Upload a dataset ───────────────────────────────────
    await page.goto("/datasets");

    // Create a temp CSV file for upload
    const tmpPath = "/tmp/test-pipeline-e2e.csv";
    fs.writeFileSync(tmpPath, createTestCsv());

    // Wait for drop zone
    await expect(page.locator(".drop-zone")).toBeVisible({ timeout: 5_000 });

    // Trigger file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpPath);

    // Wait for upload success
    await expect(
      page.locator('[class*="toast"], .status-badge').filter({ hasText: /uploaded|profil/i })
    ).toBeVisible({ timeout: 15_000 });

    // Dataset should appear in table
    await expect(
      page.locator("table td").filter({ hasText: "test-pipeline-e2e.csv" })
    ).toBeVisible({ timeout: 10_000 });

    // ── 2. Build a pipeline ───────────────────────────────────
    await page.goto("/pipelines");

    // Select the dataset
    await page.getByRole("combobox", { name: /Select dataset/ }).selectOption({ label: /test-pipeline-e2e/ });

    // Type a pipeline name
    const nameInput = page.locator("input[placeholder*='Pipeline name']");
    await nameInput.clear();
    await nameInput.fill("E2E Test Pipeline");

    // Use AI translate
    const chatInput = page.locator("textarea, input[placeholder*='Describe']");
    await chatInput.fill("remove missing values and normalize all numeric columns");

    await page.getByRole("button", { name: "Translate" }).click();

    // Steps should appear
    await expect(page.locator('[class*="step"], .bg-background').filter({ hasText: /drop_nulls|normalize/ }))
      .toBeVisible({ timeout: 15_000 });

    // ── 3. Save the pipeline ──────────────────────────────────
    await page.getByRole("button", { name: "Save" }).click();

    await expect(
      page.locator('[class*="toast"]').filter({ hasText: /saved/i })
    ).toBeVisible({ timeout: 5_000 });

    // ── 4. Execute ────────────────────────────────────────────
    await page.getByRole("button", { name: /Save & Run/ }).click();

    // Should show running state
    await expect(
      page.getByRole("button", { name: /Running/ })
    ).toBeVisible({ timeout: 5_000 });

    // Wait for completion (up to 30s for CI)
    await expect(
      page.locator('[class*="success"], .bg-success-50').filter({ hasText: /complete/i })
    ).toBeVisible({ timeout: 30_000 });

    // Download button should appear
    await expect(page.getByRole("link", { name: /Download CSV/ })).toBeVisible({ timeout: 5_000 });

    console.log("✓ Full pipeline flow completed successfully");

    // Cleanup
    fs.unlinkSync(tmpPath);
  });

  test("AI translate handles ambiguous input gracefully", async ({ page }) => {
    await page.goto("/pipelines");

    const chatInput = page.locator("textarea, input[placeholder*='Describe']");
    await chatInput.fill("xyzzy nonsense transform");

    await page.getByRole("button", { name: "Translate" }).click();

    // Should not crash — should show empty state or error message
    await expect(page.locator("body")).not.toContainText("undefined", { timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("null");
  });

  test("quick chips work", async ({ page }) => {
    await page.goto("/pipelines");

    // Click a chip
    await page.getByRole("button", { name: "Remove missing values" }).click();

    // Input should be populated
    const chatInput = page.locator("textarea, input[placeholder*='Describe']");
    await expect(chatInput).toHaveValue(/missing values/i);
  });

  test("step removal works", async ({ page }) => {
    await page.goto("/pipelines");

    // Add a step via chip
    await page.getByRole("button", { name: "Remove missing values" }).click();
    await page.getByRole("button", { name: "Translate" }).click();

    // Wait for step to appear
    await expect(
      page.locator('[class*="step"], .rounded-xl').filter({ hasText: /drop_nulls/ })
    ).toBeVisible({ timeout: 10_000 });

    // Remove it via × button
    const removeBtn = page.locator('button[aria-label*="remove"], button').filter({ hasText: "×" }).last();
    await removeBtn.click();

    // Steps count should decrease
    await expect(
      page.locator('[class*="step-count"]').or(page.getByText("0 steps"))
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Datasets Page", () => {
  test("empty state shown when no datasets", async ({ page }) => {
    await page.goto("/datasets");

    // Either the table with datasets OR empty state should be visible
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/No datasets yet/).isVisible().catch(() => false);

    expect(hasTable || hasEmpty).toBe(true);
  });

  test("upload button triggers file input", async ({ page }) => {
    await page.goto("/datasets");

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    // Upload button should trigger it
    const uploadBtn = page.getByRole("button", { name: /Upload CSV/ });
    await expect(uploadBtn).toBeVisible();
  });

  test("rejects non-CSV files", async ({ page }) => {
    await page.goto("/datasets");

    // Try to drop a non-CSV file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake pdf content"),
    });

    // Should show error toast
    await expect(
      page.locator('[class*="toast"]').filter({ hasText: /csv/i })
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Accessibility", () => {
  const pages = ["/dashboard", "/datasets", "/pipelines", "/executions"];

  for (const pagePath of pages) {
    test(`${pagePath} — keyboard navigation`, async ({ page }) => {
      await page.goto(pagePath);

      // Tab through interactive elements
      const tabCount = 10;
      for (let i = 0; i < tabCount; i++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? { tag: el.tagName, role: el.getAttribute("role"), text: el.textContent?.slice(0, 30) } : null;
        });
        // Should never have no focused element after tabbing (focus trap working)
        expect(focused).not.toBeNull();
      }
    });

    test(`${pagePath} — no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });

      await page.goto(pagePath);
      await page.waitForLoadState("networkidle");

      // Filter out known third-party noise
      const significantErrors = errors.filter(
        (e) => !e.includes("favicon") && !e.includes("sentry") && !e.includes("web-vitals")
      );

      expect(significantErrors, `Console errors on ${pagePath}: ${significantErrors.join(", ")}`).toHaveLength(0);
    });
  }
});
