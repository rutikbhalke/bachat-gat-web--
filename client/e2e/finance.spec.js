import { test, expect } from '@playwright/test';

test.describe.serial('Complete Financial Flow', () => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin3@bachatgat.com';
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || '123456';
  const timestamp = Date.now();
  const m1Name = `PW MemA ${timestamp}`;
  const m2Name = `PW MemB ${timestamp}`;
  const m1Phone = `991${String(timestamp).slice(-7)}`;
  const m2Phone = `992${String(timestamp).slice(-7)}`;

  let sharedPage;

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage();
    sharedPage.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
    sharedPage.on('pageerror', exception => console.log(`PAGE EXCEPTION: ${exception}`));
    await sharedPage.goto('http://localhost:3000');
    await sharedPage.fill('input[type="email"]', adminEmail);
    await sharedPage.fill('input[type="password"]', adminPassword);
    await sharedPage.click('button[type="submit"]');
    await expect(sharedPage.locator('text=Dashboard').first()).toBeVisible({ timeout: 15000 });
  });

  test.afterAll(async () => {
    await sharedPage.close();
  });

  test('1. Login', async () => {
    await expect(sharedPage.locator('text=Dashboard').first()).toBeVisible();
  });

  test('2. Create Test Members', async () => {
    await sharedPage.click('text=Members');
    
    // Create M1
    await sharedPage.click('text=+ Add Member');
    await sharedPage.fill('input[name="name"]', m1Name);
    await sharedPage.fill('input[name="phone"]', m1Phone);
    await sharedPage.fill('input[name="email"]', `a${timestamp}@test.com`);
    await sharedPage.fill('input[name="password"]', 'Password123');
    await sharedPage.click('button[type="submit"]');
    
    await sharedPage.waitForTimeout(3000);
    const m1ButtonText = await sharedPage.locator('button[type="submit"]').textContent();
    
    try {
      await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
    } catch (e) {
      const formValidity = await sharedPage.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return 'No form found';
        if (!form.checkValidity()) {
          const invalid = Array.from(form.elements).filter(e => !e.validity?.valid).map(e => `${e.name || e.id}: ${e.validationMessage}`);
          return invalid.join(' | ');
        }
        return 'Form is valid';
      });
      const errorText = await sharedPage.locator('div[style*="var(--danger-light)"] span').textContent({ timeout: 1000 }).catch(() => 'Unknown Error');
      throw new Error(`Member Creation Failed. UI Error: ${errorText} | HTML5 Validation: ${formValidity} | Button State: ${m1ButtonText}`);
    }
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden' });
    
    // Create M2
    await sharedPage.click('text=+ Add Member');
    await sharedPage.fill('input[name="name"]', m2Name);
    await sharedPage.fill('input[name="phone"]', m2Phone);
    await sharedPage.fill('input[name="email"]', `b${timestamp}@test.com`);
    await sharedPage.fill('input[name="password"]', 'Password123');
    await sharedPage.click('button[type="submit"]');
    
    await sharedPage.waitForTimeout(3000);
    const buttonText = await sharedPage.locator('button[type="submit"]').textContent();
    
    try {
      await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
    } catch (e) {
      const formValidity = await sharedPage.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return 'No form found';
        if (!form.checkValidity()) {
          const invalid = Array.from(form.elements).filter(e => !e.validity?.valid).map(e => `${e.name || e.id}: ${e.validationMessage}`);
          return invalid.join(' | ');
        }
        return 'Form is valid';
      });
      const errorText = await sharedPage.locator('div[style*="var(--danger-light)"] span').textContent({ timeout: 1000 }).catch(() => 'Unknown Error');
      throw new Error(`Member Creation Failed. UI Error: ${errorText} | HTML5 Validation: ${formValidity} | Button State: ${buttonText}`);
    }
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden' });
  });

  const selectMember = async (name) => {
    const optionVal = await sharedPage.locator(`select[name="member_id"] option`, { hasText: name }).first().getAttribute('value');
    await sharedPage.locator('select[name="member_id"]').selectOption(optionVal);
  };

  test('3. Regular Hapta', async () => {
    await sharedPage.click('text=Dashboard');
    await sharedPage.click('text=Add Savings');
    await selectMember(m1Name);
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('4. Duplicate Regular Hapta', async () => {
    await sharedPage.click('text=Add Savings');
    await selectMember(m1Name);
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=already recorded').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.click('button:has-text("Cancel")');
  });

  test('5. Loan Creation', async () => {
    await sharedPage.click('text=Loans');
    await sharedPage.click('text=+ Disburse New Loan');
    await selectMember(m1Name);
    await sharedPage.fill('input[name="principal_amount"]', '10000');
    await sharedPage.fill('input[name="interest_rate"]', '2.0');
    await sharedPage.click('button[type="submit"]:has-text("Disburse")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('6. First Installment', async () => {
    await sharedPage.click('text=Loans');
    const card = sharedPage.locator('.card').filter({ hasText: m1Name }).first();
    await card.locator('text=Pay Installment').click();
    
    const nextMonth = (new Date().getMonth() + 2) > 12 ? 1 : (new Date().getMonth() + 2);
    await sharedPage.locator('select[name="payment_month"]').selectOption(`${nextMonth}`);
    
    await sharedPage.fill('input[name="principal_repayment_amount"]', '2000');
    await sharedPage.fill('input[name="regular_hafta_amount"]', '1000');
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('7. Second Installment & 8. Multiple Installments Same Month', async () => {
    const card = sharedPage.locator('.card').filter({ hasText: m1Name }).first();
    await expect(card.locator('text=₹8,000')).toBeVisible({ timeout: 15000 });
    await card.locator('text=Pay Installment').click();
    
    const nextMonth = (new Date().getMonth() + 2) > 12 ? 1 : (new Date().getMonth() + 2);
    await sharedPage.locator('select[name="payment_month"]').selectOption(`${nextMonth}`);
    
    await sharedPage.fill('input[name="principal_repayment_amount"]', '1000');
    await sharedPage.fill('input[name="regular_hafta_amount"]', '0'); // regular already paid
    
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('9. Combined Payment (M2)', async () => {
    await sharedPage.click('text=Loans');
    await sharedPage.click('text=+ Disburse New Loan');
    await selectMember(m2Name);
    await sharedPage.fill('input[name="principal_amount"]', '5000');
    await sharedPage.fill('input[name="interest_rate"]', '2.0');
    await sharedPage.click('button[type="submit"]:has-text("Disburse")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
    
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden' });
    
    const card = sharedPage.locator('.card').filter({ hasText: m2Name }).first();
    await card.locator('text=Pay Installment').click();
    
    await sharedPage.fill('input[name="principal_repayment_amount"]', '1000');
    await sharedPage.fill('input[name="regular_hafta_amount"]', '1000');
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('10. Regular Hapta Already Paid', async () => {
    await sharedPage.click('text=Dashboard');
    await sharedPage.click('text=Add Savings');
    await selectMember(m2Name);
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    try {
      await expect(sharedPage.locator('text=already recorded').first()).toBeVisible({ timeout: 10000 });
    } catch (e) {
      const html = await sharedPage.evaluate(() => document.querySelector('.modal')?.innerHTML || document.body.innerHTML);
      console.log('TEST 10 FAILURE HTML DUMP:', html);
      throw e;
    }
    await sharedPage.click('button:has-text("Cancel")');
  });

  test('11. Duplicate Submission', async () => {
    await sharedPage.click('text=Dashboard');
    await sharedPage.click('text=Add Savings');
    await selectMember(m1Name);
    const thirdMonth = (new Date().getMonth() + 3) > 12 ? (new Date().getMonth() + 3 - 12) : (new Date().getMonth() + 3);
    await sharedPage.locator('select[name="month"]').selectOption(`${thirdMonth}`);
    
    await sharedPage.dblclick('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('12. Overpayment', async () => {
    await sharedPage.click('text=Loans');
    const card = sharedPage.locator('.card').filter({ hasText: m1Name }).first();
    await card.locator('text=Pay Installment').click();
    
    await sharedPage.fill('input[name="principal_repayment_amount"]', '99999');
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    
    // The UI uses HTML5 max validation, so the form won't submit. Check validity state.
    const isInvalid = await sharedPage.$eval('input[name="principal_repayment_amount"]', el => !el.validity.valid);
    expect(isInvalid).toBe(true);

    await sharedPage.click('button:has-text("Cancel")');
  });

  test('13. Full Loan Closure', async () => {
    await sharedPage.click('text=Loans');
    const card = sharedPage.locator('.card').filter({ hasText: m2Name }).first();
    await card.locator('text=Pay Installment').click();
    await sharedPage.fill('input[name="principal_repayment_amount"]', '4000');
    await sharedPage.fill('input[name="regular_hafta_amount"]', '0');
    await sharedPage.click('button[type="submit"]:has-text("Record")');
    await expect(sharedPage.locator('text=successfully').first()).toBeVisible({ timeout: 15000 });
    await sharedPage.waitForSelector('text=successfully', { state: 'hidden', timeout: 10000 });
  });

  test('14. Monthly Report & Printable Register', async () => {
    await sharedPage.click('text=Reports');
    await sharedPage.click('button:has-text("Monthly Report")');
    // Month-wise, Combined Collection, and Printable Register all exist on this tab
    await expect(sharedPage.locator('text=TOTAL SAVINGS (MONTH)').first()).toBeVisible({ timeout: 15000 });
    
    // Toggle the printable register preview
    await sharedPage.click('button:has-text("Preview Register Format")');
    
    await expect(sharedPage.locator(`text=${m1Name}`).first()).toBeVisible();
    await expect(sharedPage.locator('text=Total Members').first()).toBeVisible();
  });

  test('15. Pending / Expected Dues', async () => {
    await sharedPage.click('button:has-text("Pending Dues")');
    await expect(sharedPage.locator('text=TOTAL PENDING DUES').first()).toBeVisible({ timeout: 15000 });
  });

  test('16. Loan-wise Detailed Report', async () => {
    await sharedPage.click('button:has-text("Loans Overview")');
    await expect(sharedPage.locator('text=TOTAL DISBURSED').first()).toBeVisible({ timeout: 15000 });
  });

  test('17. Member-wise Financial Report', async () => {
    await sharedPage.click('button:has-text("Monthly Report")');
    // Wait for data
    await expect(sharedPage.locator(`text=${m1Name}`).first()).toBeVisible();
    // Click History for M1 (assuming there's a button with an eye/history icon or text)
    // We will just evaluate a click on the first history button in the table row for m1Name
    await sharedPage.locator(`tr:has-text("${m1Name}") >> button`).first().click();
    await expect(sharedPage.locator('text=Bachat Gat Member History').first()).toBeVisible({ timeout: 15000 });
    // Assuming there is an X or Close icon for the modal, we'll try to find a button to close it
    await sharedPage.locator('.member-history-modal-screen button').first().click();
  });

  test('21. Negative Tests', async () => {
    await sharedPage.click('text=Loans');
    await sharedPage.click('text=+ Disburse New Loan');
    await sharedPage.click('button[type="submit"]:has-text("Disburse")');
    const isInvalid = await sharedPage.$eval('select[name="member_id"]', el => !el.validity.valid);
    expect(isInvalid).toBe(true);
    await sharedPage.click('button:has-text("Cancel")');
  });
});
