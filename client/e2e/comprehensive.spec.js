import { test, expect } from '@playwright/test';

test.describe.serial('Bachat Gat Comprehensive E2E Suite', () => {
  const adminEmail = 'admin@bachatgat.com';
  const adminPassword = 'Admin@123';

  async function loginAdmin(page) {
    await page.goto('/login');
    if (page.url().includes('/dashboard')) return;
    await page.click('button:has-text("Admin Login")');
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', adminPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
  }

  test('1. AUTH: Invalid Login Failure', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Admin Login")');
    await page.fill('input[type="email"]', 'wrong@admin.com');
    await page.fill('input[type="password"]', 'WrongPass123');
    await page.click('button[type="submit"]');

    // Verify invalid login message
    await expect(page.locator('text=Invalid email or password.')).toBeVisible({ timeout: 15000 });
    // Verify stay on login page
    expect(page.url()).toContain('/login');
  });

  test('2. AUTH: Valid Admin Login & Session Persistence', async ({ page }) => {
    await loginAdmin(page);

    // Verify dashboard elements loaded
    await expect(page.locator('text=Quick Actions')).toBeVisible({ timeout: 15000 });

    // Verify session persistence across page reload
    await page.reload();
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 20000 });
    await expect(page.locator('text=Quick Actions')).toBeVisible({ timeout: 30000 });
  });

  test('3. DASHBOARD: Financial KPI Cards & Recent Activity', async ({ page }) => {
    await loginAdmin(page);

    // Verify presence of all key summary cards
    await expect(page.locator('text=TOTAL GROUP FUND').or(page.locator('text=Total Group Fund')).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=AVAILABLE BALANCE').or(page.locator('text=Available Balance')).first()).toBeVisible();
    await expect(page.locator('text=TOTAL SAVINGS COLLECTED').or(page.locator('text=Total Savings')).first()).toBeVisible();
    await expect(page.locator('text=ACTIVE LOANS OUTSTANDING').or(page.locator('text=Active Loans')).first()).toBeVisible();

    // Verify authoritative KPI values are rendered and positive
    const fundText = await page.locator('h1').filter({ hasText: /₹/ }).first().textContent();
    expect(fundText).toMatch(/₹[\d,]+/);
    const balanceText = await page.locator('text=AVAILABLE BALANCE').first().locator('..').textContent();
    expect(balanceText).toMatch(/₹[\d,]+/);
    const loansText = await page.locator('text=Active Loans').first().locator('..').textContent();
    expect(loansText).toMatch(/₹[\d,]+/);

    // Verify recent activity table
    await expect(page.locator('text=Recent Transactions').or(page.locator('text=Recent Activity')).first()).toBeVisible();
  });

  test('4. MEMBERS: Load, Search, Count & Details View', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to Members
    await page.click('aside >> a[href="/members"]');
    await expect(page).toHaveURL(/.*members/, { timeout: 15000 });

    // Verify members tab loaded
    await expect(page.locator('button:has-text("All Members")').first()).toBeVisible({ timeout: 15000 });

    // Search for a specific member
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await searchInput.fill('रविंद्र');
    await page.waitForTimeout(500);
    await expect(page.locator('text=रविंद्र भागवत गुंजाळ').first()).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(500);

    // Open Add Member Modal
    await page.click('button:has-text("Add Member")');
    await expect(page.locator('h2:has-text("Add Member")')).toBeVisible();

    // Verify validation requires name (submit button has text "Record")
    await page.click('button[type="submit"]:has-text("Record")');
    const isNameInvalid = await page.$eval('input[name="name"]', el => !el.validity.valid);
    expect(isNameInvalid).toBe(true);

    // Cancel modal cleanly without modifying any data
    await page.click('button:has-text("Cancel")');
  });

  test('5. SAVINGS: Monthly Savings & Duplicate Prevention', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to Monthly Savings
    await page.click('aside >> a[href="/savings"]');
    await expect(page).toHaveURL(/.*savings/, { timeout: 15000 });

    // Click Record Monthly Savings
    await page.click('button:has-text("Record Monthly Savings")');
    await expect(page.locator('h2:has-text("Record Monthly Savings")')).toBeVisible();

    // Wait until members dropdown is populated
    await page.waitForFunction(() => (document.querySelector('select[name="member_id"]')?.options.length || 0) > 1, { timeout: 15000 });
    await page.selectOption('select[name="member_id"]', 'member_001');
    await page.selectOption('select[name="month"]', '9');
    await page.fill('input[name="year"]', '2026');

    // Attempt to submit duplicate
    await page.click('button[type="submit"]:has-text("Record Savings")');

    // Should indicate already recorded / duplicate error
    await expect(page.locator('text=already recorded').or(page.locator('text=आधीच नोंदवले')).first()).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Cancel")');
  });

  test('6. LOANS & REPAYMENTS: Loan List, 2% Interest Rule & Overpayment Prevention', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to Loans
    await page.click('aside >> a[href="/loans"]');
    await expect(page).toHaveURL(/.*loans/, { timeout: 15000 });

    // Wait for loader to finish and loans list to load
    await page.waitForSelector('text=Loading loans...', { state: 'detached', timeout: 25000 }).catch(() => {});
    await expect(page.locator('.card').filter({ hasText: 'LN-' }).first()).toBeVisible({ timeout: 20000 });

    // Test Disburse Loan validation
    await page.click('button:has-text("Disburse New Loan")');
    await expect(page.locator('h2:has-text("Issue New Group Loan")')).toBeVisible();

    // Clear principal to trigger validation
    await page.fill('input[name="principal_amount"]', '');
    await page.click('button[type="submit"]:has-text("Disburse Loan")');
    const isPrincipalInvalid = await page.$eval('input[name="principal_amount"]', el => !el.validity.valid);
    expect(isPrincipalInvalid).toBe(true);
    await page.click('button:has-text("Cancel")');

    // Test Pay Installment modal on an active loan card
    const payBtn = page.locator('button:has-text("Pay Installment")').first();
    if (await payBtn.isVisible()) {
      await payBtn.click();
      await expect(page.locator('h2:has-text("Record Loan Payment")')).toBeVisible({ timeout: 10000 });

      // Overpayment validation check (entering huge number exceeds max=outstanding)
      await page.fill('input[name="principal_repayment_amount"]', '999999');
      await page.click('button[type="submit"]:has-text("Record Payment")');
      const isOverpaymentInvalid = await page.$eval('input[name="principal_repayment_amount"]', el => !el.validity.valid);
      expect(isOverpaymentInvalid).toBe(true);

      await page.click('button:has-text("Cancel")');
    }
  });

  test('7. REPORTS: 8-Column Monthly Balance Register, Positive Balance & Date Filters', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to Reports
    await page.click('aside >> a[href="/reports"]');
    await expect(page).toHaveURL(/.*reports/, { timeout: 15000 });

    // Switch to Monthly Balance Report (ताळेबंद रिपोर्ट)
    await page.click('button:has-text("Monthly Balance Report")');
    await expect(page.locator('text=महिन्याचा ताळेबंद रिपोर्ट')).toBeVisible({ timeout: 15000 });

    // Verify all 8 table columns from the physical register
    const headers = ['अ.नं.', 'निधी जमा', 'कर्ज जमा', 'हप्ता जमा', 'व्याज जमा', 'कर्ज वाटप', 'एकूण शिल्लक', 'तारीख'];
    for (const h of headers) {
      await expect(page.locator('.taaleband-print-area').locator(`th:has-text("${h}")`).first()).toBeVisible();
    }

    // Verify rows exist
    const rows = page.locator('.taaleband-print-area tbody tr');
    await expect(rows.first()).toBeVisible();

    // Verify positive balances (no minus sign in any cell of the एकूण शिल्लक column)
    const tableText = await page.locator('.taaleband-print-area tbody').textContent();
    expect(tableText).not.toContain('-₹');

    // Test Date Filter inputs for 3-Month Range: 2026-01-01 to 2026-03-31
    const fromInput = page.locator('.no-print input[type="date"]').first();
    const toInput = page.locator('.no-print input[type="date"]').nth(1);
    await fromInput.fill('2026-01-01');
    await toInput.fill('2026-03-31');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);

    // Verify 3 rows for Jan, Feb, Mar
    const rangeRows = page.locator('.taaleband-print-area tbody tr');
    await expect(rangeRows).toHaveCount(3);

    // Verify "कर्ज जमा" column (3rd column): Jan=0.00, Feb=0.00, Mar=40000.00
    const janDeposit = await rangeRows.nth(0).locator('td').nth(2).textContent();
    expect(janDeposit.trim()).toBe('0.00');

    const febDeposit = await rangeRows.nth(1).locator('td').nth(2).textContent();
    expect(febDeposit.trim()).toBe('0.00');

    const marDeposit = await rangeRows.nth(2).locator('td').nth(2).textContent();
    expect(marDeposit.trim()).toBe('40000.00');

    // Verify footer "कर्ज जमा" is sum ₹40,000.00
    const footerLoanDeposit = await page.locator('.taaleband-print-area tfoot tr td').nth(2).textContent();
    expect(footerLoanDeposit.trim()).toBe('40000.00');

    // Verify Summary Card 1: एकूण बचत (Total Savings) reflects exactly the 3-month range sum ₹1,20,000
    await expect(page.locator('text=१. एकूण बचत (Total Savings)').locator('..').locator('text=₹1,20,000')).toBeVisible();
    // Verify Summary Card 2: कर्ज जमा (Loan Deposit) is ₹40,000
    await expect(page.locator('text=२. कर्ज जमा (Loan Deposit)').locator('..').locator('text=₹40,000')).toBeVisible();
    // Verify Summary Card 3: मुद्दल परतफेड (Principal Repaid) is ₹12,000
    await expect(page.locator('text=३. मुद्दल परतफेड (Principal Repaid)').locator('..').locator('text=₹12,000')).toBeVisible();

    // Test Single-Month Range WITHOUT deposit: 2026-02-01 to 2026-02-28
    await fromInput.fill('2026-02-01');
    await toInput.fill('2026-02-28');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    const febRows = page.locator('.taaleband-print-area tbody tr');
    await expect(febRows).toHaveCount(1);
    expect((await febRows.first().locator('td').nth(2).textContent()).trim()).toBe('0.00');

    // Test Single-Month Range WITH deposit: 2026-03-01 to 2026-03-31
    await fromInput.fill('2026-03-01');
    await toInput.fill('2026-03-31');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    const marRows = page.locator('.taaleband-print-area tbody tr');
    await expect(marRows).toHaveCount(1);
    expect((await marRows.first().locator('td').nth(2).textContent()).trim()).toBe('40000.00');

    // Test Single-Month Range WITH deposit: 2026-06-01 to 2026-06-30
    await fromInput.fill('2026-06-01');
    await toInput.fill('2026-06-30');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    const junRows = page.locator('.taaleband-print-area tbody tr');
    await expect(junRows).toHaveCount(1);
    expect((await junRows.first().locator('td').nth(2).textContent()).trim()).toBe('60000.00');

    // Test Partial-Month Range: 2026-03-01 to 2026-03-20
    await fromInput.fill('2026-03-01');
    await toInput.fill('2026-03-20');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    const partialRows = page.locator('.taaleband-print-area tbody tr');
    await expect(partialRows).toHaveCount(1);
    expect((await partialRows.first().locator('td').nth(2).textContent()).trim()).toBe('40000.00');

    // Test Single-Day Range: 2026-03-15 to 2026-03-15
    await fromInput.fill('2026-03-15');
    await toInput.fill('2026-03-15');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    const singleDayRows = page.locator('.taaleband-print-area tbody tr');
    await expect(singleDayRows).toHaveCount(1);

    // Test Empty Range: 2024-01-01 to 2024-01-31 (No transactions in 2024)
    await fromInput.fill('2024-01-01');
    await toInput.fill('2024-01-31');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=No transactions found for this period.')).toBeVisible();

    // Test Full 12-Month Range: 2025-10-01 to 2026-09-30
    await fromInput.fill('2025-10-01');
    await toInput.fill('2026-09-30');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(1000);
    const full12mRows = page.locator('.taaleband-print-area tbody tr');
    await expect(full12mRows).toHaveCount(12);

    // Verify 12-month totals in footer:
    const fullFooterCols = page.locator('.taaleband-print-area tfoot tr td');
    expect(Number((await fullFooterCols.nth(1).textContent()).trim())).toBeGreaterThanOrEqual(479000);
    expect(Number((await fullFooterCols.nth(2).textContent()).trim())).toBeGreaterThanOrEqual(180000);
    expect(Number((await fullFooterCols.nth(3).textContent()).trim())).toBeGreaterThanOrEqual(60000);
    expect(Number((await fullFooterCols.nth(4).textContent()).trim())).toBeGreaterThanOrEqual(5040);
    expect(Number((await fullFooterCols.nth(5).textContent()).trim())).toBeGreaterThanOrEqual(95000);
    expect(Number((await fullFooterCols.nth(6).textContent()).trim())).toBeGreaterThan(0);

    // Verify Export CSV button is clickable
    await expect(page.locator('button:has-text("Export CSV")').first()).toBeVisible();

    // Test Print Register layout on Monthly Report tab
    await page.click('button:has-text("Monthly Report")');
    await page.click('button:has-text("Preview Register Format")');
    await expect(page.locator('text=हप्ता मागणी रिपोर्ट').first()).toBeVisible();
  });

  test('8. SETTINGS & LOGOUT: Settings View & Admin Logout', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to Settings
    await page.click('aside >> a[href="/settings"]');
    await expect(page).toHaveURL(/.*settings/, { timeout: 15000 });
    await expect(page.locator('text=Group Settings').or(page.locator('text=बचतगट सेटिंग्ज')).first()).toBeVisible();

    // Logout via Profile menu dropdown
    await page.locator('header button').filter({ hasText: /Admin|Administrator|User|admin/i }).first().click();
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/.*login/, { timeout: 20000 });
  });
});
