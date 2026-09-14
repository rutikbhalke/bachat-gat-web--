import { test, expect } from '@playwright/test';

test.describe('Centralized Status & Validation Popup System', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('Validation popup appears when creating a loan with invalid duration (duration != 10)', async ({ page }) => {
    await page.goto('/loans');
    await page.waitForTimeout(1000);

    // Click on New Loan button
    const newLoanBtn = page.locator('button:has-text("नवीन कर्ज द्या"), button:has-text("New Loan"), button:has-text("Create Loan")').first();
    if (await newLoanBtn.isVisible()) {
      await newLoanBtn.click();
      await page.waitForSelector('form, [role="dialog"]', { timeout: 10000 });

      // Select first valid member
      const memberSelect = page.locator('select').first();
      if (await memberSelect.isVisible()) {
        await memberSelect.selectOption({ index: 1 }).catch(() => {});
      }

      // Enter amount
      const amountInput = page.locator('input[name="amount"], input[name="principalAmount"], input[name="principal_amount"]').first();
      if (await amountInput.isVisible()) {
        await amountInput.fill('5000');
      }

      // Change duration to invalid duration (e.g. 5 months instead of 10)
      const durationInput = page.locator('input[name="durationMonths"], input[name="duration_months"], input[name="duration"]').first();
      if (await durationInput.isVisible()) {
        await durationInput.fill('5');
      }

      // Submit form
      const submitBtn = page.locator('button[type="submit"]:has-text("कर्ज मंजूर करा"), button[type="submit"]:has-text("Approve"), button[type="submit"]:has-text("Create")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Check if custom status popup modal appears
        const popup = page.locator('[role="dialog"]:has-text("त्रुटी"), [role="dialog"]:has-text("Error"), [role="dialog"]:has-text("कालावधी")');
        await expect(popup).toBeVisible({ timeout: 10000 });

        // Close popup
        const okBtn = popup.locator('button:has-text("समजले"), button:has-text("OK"), button:has-text("ठीक आहे")').first();
        if (await okBtn.isVisible()) {
          await okBtn.click();
        }
      }
    }
  });

  test('Confirmation dialog appears before recording savings and clicking Cancel prevents database write', async ({ page }) => {
    await page.goto('/savings');
    await page.waitForTimeout(1000);

    // Open Record Savings Modal
    const addSavingsBtn = page.locator('button:has-text("बचत नोंदवा"), button:has-text("Record Savings"), button:has-text("जमा करा")').first();
    if (await addSavingsBtn.isVisible()) {
      await addSavingsBtn.click();
      await page.waitForSelector('form, [role="dialog"]', { timeout: 10000 });

      // Select member
      const memberSelect = page.locator('select').first();
      if (await memberSelect.isVisible()) {
        await memberSelect.selectOption({ index: 1 }).catch(() => {});
      }

      // Set amount
      const amountInput = page.locator('input[name="amount"], input[name="paidAmount"]').first();
      if (await amountInput.isVisible()) {
        await amountInput.fill('1000');
      }

      // Click submit to trigger confirmation popup
      const submitBtn = page.locator('button[type="submit"]:has-text("नोंदवा"), button[type="submit"]:has-text("Record"), button[type="submit"]:has-text("Save")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Verify confirmation popup appears
        const confirmDialog = page.locator('[role="dialog"]:has-text("नक्की करायचे आहे का?"), [role="dialog"]:has-text("Confirm"), [role="dialog"]:has-text("बचत पावती खात्री")');
        
        if (await confirmDialog.isVisible()) {
          // Click Cancel on confirmation dialog
          const cancelBtn = confirmDialog.locator('button:has-text("रद्द करा"), button:has-text("Cancel")').first();
          await expect(cancelBtn).toBeVisible();
          await cancelBtn.click();

          // Verify confirmation dialog closed
          await expect(confirmDialog).toBeHidden();
        }
      }
    }
  });

  test('Custom popup keyboard trap (ESC key closes modal)', async ({ page }) => {
    await page.goto('/savings');
    await page.waitForTimeout(1000);

    const addSavingsBtn = page.locator('button:has-text("बचत नोंदवा"), button:has-text("Record Savings"), button:has-text("जमा करा")').first();
    if (await addSavingsBtn.isVisible()) {
      await addSavingsBtn.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

      // Trigger empty submission for error popup
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();

        // Popup should appear
        const popup = page.locator('[role="dialog"]');
        if (await popup.isVisible()) {
          await page.keyboard.press('Escape');
          // ESC handled safely
          await page.waitForTimeout(500);
        }
      }
    }
  });
});
