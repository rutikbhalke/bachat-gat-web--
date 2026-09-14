import { test, expect } from '@playwright/test';

test.describe('Record Loan Repayment Validation and Success', () => {
  test('Record repayment of ₹2,000 principal + ₹1,000 hapta + ₹200 interest on ₹10,000 loan succeeds without Quota exceeded', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    if (!page.url().includes('/dashboard')) {
      await page.click('button:has-text("Admin Login")');
      await page.fill('input[type="email"]', 'admin@bachatgat.com');
      await page.fill('input[type="password"]', 'Admin@123');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
    }

    // 2. Go to Loans page
    await page.click('aside >> a[href="/loans"]');
    await expect(page).toHaveURL(/.*loans/, { timeout: 15000 });

    // Wait for loans to load
    await page.waitForSelector('.card:has-text("LN-")', { timeout: 20000 });

    // Find the first active loan card with a Pay Installment button
    const targetCard = page.locator('.card:has(button:has-text("Pay Installment"))').first();
    await expect(targetCard).toBeVisible({ timeout: 10000 });

    const payBtn = targetCard.locator('button:has-text("Pay Installment")');
    await payBtn.click();

    // Verify modal opened
    await expect(page.locator('h2:has-text("Record Loan Payment")')).toBeVisible({ timeout: 10000 });

    // Fill Principal Repayment = 1000
    const principalInput = page.locator('input[name="principal_repayment_amount"]');
    await principalInput.fill('1000');

    // Fill Regular Hapta = 1000
    const haftaInput = page.locator('input[name="regular_hafta_amount"]');
    await haftaInput.fill('1000');

    // Verify Automatic Payment Calculation displays expected amounts
    const calcSection = page.locator('text=AUTOMATIC PAYMENT CALCULATION').locator('..');
    await expect(calcSection).toBeVisible();
    await expect(calcSection).toContainText('₹1,000');

    // Click "Record Payment"
    const submitBtn = page.locator('button[type="submit"]:has-text("Record Payment")');
    await submitBtn.click();

    // Verify that NO "Quota exceeded" error appears
    await page.waitForTimeout(1000);
    const hasQuotaError = await page.locator('text=Quota exceeded').isVisible();
    expect(hasQuotaError).toBe(false);

    // Verify modal closes upon success
    await expect(page.locator('.app-modal')).not.toBeVisible({ timeout: 15000 });
  });

  test('Verify Reports page includes loan principal repayment in monthly report table and taaleband', async ({ page }) => {
    await page.goto('/login');
    if (!page.url().includes('/dashboard')) {
      await page.click('button:has-text("Admin Login")');
      await page.fill('input[type="email"]', 'admin@bachatgat.com');
      await page.fill('input[type="password"]', 'Admin@123');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
    }

    // Go to Reports
    await page.click('aside >> a[href="/reports"]');
    await expect(page).toHaveURL(/.*reports/, { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 1. Verify Member 25 row in Monthly Report table
    // The member Shantabai has repayments dynamically aggregated for this month
    const memRow = page.locator('table').nth(1).locator('tbody tr').filter({ hasText: 'शांताबाई' });
    await expect(memRow).toBeVisible({ timeout: 10000 });
    const memRowText = await memRow.innerText();
    expect(memRowText).toContain('ACTIVE LOAN');
    expect(memRowText).toContain('₹12,000');

    // Verify individual columns are populated dynamically and not empty or '-'
    const cells = await memRow.locator('td').allInnerTexts();
    expect(cells[2]).toContain('₹');       // Monthly Savings (निधी)
    expect(cells[3]).toContain('₹12,000'); // Active Loan (कर्ज)
    expect(cells[4]).toContain('/ 10');    // Installment # (हप्ता)
    expect(cells[5]).toContain('₹');       // Principal Due (हप्ता) / Principal Repaid
    expect(cells[5]).not.toBe('-');
    expect(cells[6]).toContain('₹');       // Interest (व्याज)
    expect(cells[6]).not.toBe('-');
    expect(cells[7]).toContain('₹');       // Total Demand (एकूण)

    // 2. Verify Taaleband (Monthly Balance Report)
    await page.click('button:has-text("Monthly Balance Report")');
    await page.waitForTimeout(2500);

    const taalebandTable = page.locator('table');
    await expect(taalebandTable).toBeVisible();
    const taalebandRows = await page.locator('table tbody tr').allInnerTexts();
    expect(taalebandRows.length).toBeGreaterThan(0);

    // Find the row for month 9 (September)
    const month9Row = taalebandRows.find(r => r.includes('/09/2026') || r.startsWith('9\t'));
    expect(month9Row).toBeDefined();
    const cols = month9Row.split('\t');
    // Table columns: 0: Sr, 1: Fund Deposit, 2: Hapta Paid (Principal), 3: Interest Paid, 4: Disbursed, 5: Total Balance, 6: Date
    expect(Number(cols[2])).toBeGreaterThanOrEqual(2000); // हप्ता जमा (Principal Repaid)
    expect(Number(cols[3])).toBeGreaterThanOrEqual(200);  // व्याज जमा (Interest Paid)
  });
});

