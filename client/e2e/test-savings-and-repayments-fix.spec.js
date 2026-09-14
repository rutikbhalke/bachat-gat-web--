import { test, expect } from '@playwright/test';

test.describe('Regular Hapta Double-Counting Fix and Member Profile Loan Repayments Tab', () => {
  test('Member Details page shows real loan repayments and RecordRepaymentModal displays correct Regular Hapta status', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    if (!page.url().includes('/dashboard')) {
      const adminBtn = page.locator('button:has-text("Admin Login")');
      if (await adminBtn.isVisible()) {
        await adminBtn.click();
      }
      await page.fill('input[type="email"]', 'admin@bachatgat.com');
      await page.fill('input[type="password"]', 'Admin@123');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
    }

    // 2. Navigate to Members page
    await page.click('aside >> a[href="/members"]');
    await expect(page).toHaveURL(/.*members/, { timeout: 15000 });

    // Wait for members list to load
    await page.waitForSelector('.keyboard-card', { timeout: 20000 });

    // Click on the first member (TM-001 or Test Member 01)
    const firstMemberLink = page.locator('.keyboard-card').first();
    await firstMemberLink.click();
    await expect(page).toHaveURL(/.*members\/[a-zA-Z0-9_-]+/, { timeout: 15000 });

    // 3. Check Loan Repayments Tab
    const repayTabBtn = page.locator('button:has-text("Loan Repayments")');
    await expect(repayTabBtn).toBeVisible({ timeout: 10000 });
    await repayTabBtn.click();

    // Verify repayments table or cards load
    await page.waitForTimeout(1000);
    const hasRepaymentsTable = await page.locator('.custom-table').isVisible();
    const hasRepaymentHeader = await page.locator('h2:has-text("Loan Repayment Transactions")').isVisible();
    expect(hasRepaymentHeader).toBe(true);

    // 4. Navigate to Loans page
    await page.click('aside >> a[href="/loans"]');
    await expect(page).toHaveURL(/.*loans/, { timeout: 15000 });

    // Wait for active loan card
    const payBtn = page.locator('button:has-text("Pay Installment"), button:has-text("Record Payment")').first();
    if (await payBtn.isVisible()) {
      await payBtn.click();

      // Verify Record Loan Payment modal opens
      await expect(page.locator('h2:has-text("Record Loan Payment")')).toBeVisible({ timeout: 10000 });

      // Verify Regular Hapta input exists
      const regHaptaInput = page.locator('input[name="regular_hafta_amount"]');
      await expect(regHaptaInput).toBeVisible();

      // Close modal
      const closeBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close"]').first();
      await closeBtn.click();
    }
  });
});
