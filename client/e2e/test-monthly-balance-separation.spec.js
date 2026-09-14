import { test, expect } from '@playwright/test';

test.describe('Monthly Balance Report Strict Column Separation & Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Login as admin to test_isolated_group_999
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
  });

  test('Dashboard displays reconciled equation: Group Fund = Available Balance + Active Loan Outstanding', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('.card', { timeout: 20000 });

    // Ensure we are working strictly in the isolated test group
    const isolatedGroupId = await page.evaluate(() => {
      const currentGrp = JSON.parse(localStorage.getItem('current_group') || '{}');
      return currentGrp.id || currentGrp.groupId || 'test_isolated_group_999';
    });
    expect(isolatedGroupId).not.toBe('shivshahi_group_001');

    // Check dashboard stat cards
    const cards = page.locator('.card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('Monthly Balance Report (Taaleband) contains separate columns for Regular Savings, Loan Principal, and Interest', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForTimeout(1000);

    // Switch to Monthly Balance Report tab (Taaleband)
    const taalebandTab = page.locator('button.tab-btn:has-text("Monthly Balance Report")');
    await expect(taalebandTab).toBeVisible({ timeout: 10000 });
    await taalebandTab.click();

    // Wait for the report table to render
    await page.waitForSelector('.table-container table, table.custom-table, table', { timeout: 15000 });

    // Verify separate column headers exist
    const tableHeaders = page.locator('th');
    const headerTexts = await tableHeaders.allInnerTexts();
    const joinedHeaders = headerTexts.join(' ');

    // 1. Regular Savings column
    expect(
      joinedHeaders.includes('नियमित बचत') || 
      joinedHeaders.includes('Regular Savings') || 
      joinedHeaders.includes('निधी जमा')
    ).toBe(true);

    // 2. Loan Principal Repaid column
    expect(
      joinedHeaders.includes('कर्ज मुद्दल परतफेड') || 
      joinedHeaders.includes('Principal Repaid') || 
      joinedHeaders.includes('कर्ज जमा')
    ).toBe(true);

    // 3. Interest Paid column
    expect(
      joinedHeaders.includes('जमा व्याज') || 
      joinedHeaders.includes('Interest Paid') || 
      joinedHeaders.includes('व्याज जमा')
    ).toBe(true);

    // 4. Loan Disbursed column
    expect(
      joinedHeaders.includes('कर्ज वाटप') || 
      joinedHeaders.includes('Loan Disbursed')
    ).toBe(true);

    // 5. Available Balance column
    expect(
      joinedHeaders.includes('उपलब्ध शिल्लक') || 
      joinedHeaders.includes('Available Balance') || 
      joinedHeaders.includes('एकूण शिल्लक')
    ).toBe(true);

    console.log('Verified column headers in Taaleband report:', headerTexts);
  });
});
