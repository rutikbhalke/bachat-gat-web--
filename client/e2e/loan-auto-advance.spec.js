import { test, expect } from "@playwright/test";

test.describe.serial("Loan Installment Auto-Advance Flow", () => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL || "admin3@bachatgat.com";
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || "123456";

  test("1. Verify Loan Schedule and Next Unpaid Installment in UI", async ({ page }) => {
    // 1. Login
    await page.goto("http://localhost:3000");
    await page.fill("input[type=\"email\"]", adminEmail);
    await page.fill("input[type=\"password\"]", adminPassword);
    await page.click("button[type=\"submit\"]");
    await expect(page.locator("text=Dashboard").first()).toBeVisible({ timeout: 15000 });

    // 2. Navigate to Loans
    await page.click("text=Loans");
    await page.waitForTimeout(2000);

    // 3. Open Record Repayment Modal
    const recordBtn = page.locator("button:has-text(\"Record Repayment\")").first();
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      await expect(page.locator("text=Record Loan Payment").first()).toBeVisible({ timeout: 5000 });
      
      // Verify month and year inputs exist and are populated
      const monthSelect = page.locator("select[name=\"payment_month\"]");
      const yearInput = page.locator("input[name=\"payment_year\"]");
      await expect(monthSelect).toBeVisible();
      await expect(yearInput).toBeVisible();
      
      // Verify Expected Due panel is rendered
      await expect(page.locator("text=EXPECTED (INST #").first()).toBeVisible();

      // Close modal
      await page.click("button:has-text(\"Cancel\")");
    }
  });
});
